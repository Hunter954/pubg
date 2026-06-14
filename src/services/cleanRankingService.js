import { prisma } from '../db.js';
import { config } from '../config.js';
import { calculateScore } from '../utils/score.js';
import { getCurrentSeasonId, getPlayerRecentMatchIds, getMatch, getTelemetryEvents } from './pubgApi.js';

const CLEAN_PARSER_VERSION = 'teamid-200-v2';
const BOT_TEAM_ID_MIN = 200;
const DEFAULT_MAX_RECENT_PER_PLAYER = 100;
const DEFAULT_MAX_CANDIDATE_MATCHES = 250;

const CLEAN_ORDER_FIELDS = new Set([
  'score', 'kills', 'damage', 'botDamageIgnored', 'wins', 'top10s', 'revives', 'longestKill',
  'matchesPlayed', 'deaths', 'teamKills', 'headshotKills', 'dbnos', 'botKillsIgnored', 'botDbnosIgnored'
]);

function logCleanWarn(message, details = {}) {
  console.warn('[clean-ranking]', message, details);
}

function findTelemetryUrl(match) {
  const asset = (match?.included || []).find((item) => item.type === 'asset' && item.attributes?.URL);
  return asset?.attributes?.URL || null;
}

function participantMap(match) {
  const map = new Map();
  const participants = (match?.included || []).filter((item) => item.type === 'participant');
  for (const p of participants) {
    const stats = p.attributes?.stats || {};
    if (stats.playerId) map.set(stats.playerId, stats);
  }
  return map;
}

function emptyCleanStats() {
  return {
    score: 0,
    kills: 0,
    botKillsIgnored: 0,
    assists: 0,
    damage: 0,
    botDamageIgnored: 0,
    wins: 0,
    top10s: 0,
    revives: 0,
    longestKill: 0,
    matchesPlayed: 0,
    deaths: 0,
    teamKills: 0,
    headshotKills: 0,
    dbnos: 0,
    botDbnosIgnored: 0
  };
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function getAccountId(character) {
  return firstDefined(
    character?.accountId,
    character?.accountIdString,
    character?.playerId,
    character?.playerIdString,
    character?.id
  ) || null;
}

function getTeamId(character, context = {}) {
  const raw = firstDefined(
    character?.teamId,
    character?.teamID,
    character?.team_id,
    character?.team
  );
  if (raw === undefined || raw === null || raw === '') {
    logCleanWarn('teamId ausente na telemetry; evento ignorado para classificação anti-bot', context);
    return null;
  }

  const teamId = Number(raw);
  if (!Number.isFinite(teamId)) {
    logCleanWarn('teamId inválido na telemetry; evento ignorado para classificação anti-bot', { ...context, teamId: raw });
    return null;
  }
  return teamId;
}

function isBotTeam(teamId) {
  return Number.isFinite(Number(teamId)) && Number(teamId) >= BOT_TEAM_ID_MIN;
}

function isSameTeam(a, b) {
  return a !== null && b !== null && Number(a) === Number(b);
}

function getKillKiller(event) {
  return firstDefined(event.killer, event.attacker, event.finisher, event.damageCauser, event.killerCharacter);
}

function getKillVictim(event) {
  return firstDefined(event.victim, event.character, event.target, event.victimCharacter);
}

function getGroggyAttacker(event) {
  return firstDefined(event.attacker, event.killer, event.damageCauser, event.instigator);
}

function getDamageAttacker(event) {
  return firstDefined(event.attacker, event.killer, event.damageCauser, event.instigator);
}

function getDamageVictim(event) {
  return firstDefined(event.victim, event.character, event.target);
}

function isHeadshot(event) {
  const values = [
    event.damageReason,
    event.reason,
    event.killerDamageInfo?.damageReason,
    event.finishDamageInfo?.damageReason,
    event.victimDamageInfo?.damageReason,
    event.damageInfo?.damageReason
  ];
  return values.some((value) => String(value || '').toLowerCase().includes('headshot'));
}

function distanceMeters(value) {
  const distance = Number(value || 0);
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  // PUBG telemetry geralmente envia distância em centímetros nos eventos de kill.
  return distance > 1000 ? distance / 100 : distance;
}

function eventDamage(event) {
  const value = firstDefined(event.damage, event.damageDealt, event.damageAmount, event.damageInfo?.damage, event.damageInfo?.damageDealt);
  const damage = Number(value || 0);
  return Number.isFinite(damage) ? Math.max(0, damage) : 0;
}

function sumCleanRows(rows) {
  const total = emptyCleanStats();
  for (const row of rows) {
    total.kills += Number(row.kills || 0);
    total.botKillsIgnored += Number(row.botKillsIgnored || 0);
    total.assists += Number(row.assists || 0);
    total.damage += Number(row.damage || 0);
    total.botDamageIgnored += Number(row.botDamageIgnored || 0);
    total.wins += Number(row.wins || 0);
    total.top10s += Number(row.top10s || 0);
    total.revives += Number(row.revives || 0);
    total.longestKill = Math.max(total.longestKill, Number(row.longestKill || 0));
    total.matchesPlayed += Number(row.matchesPlayed || 0);
    total.deaths += Number(row.deaths || 0);
    total.teamKills += Number(row.teamKills || 0);
    total.headshotKills += Number(row.headshotKills || 0);
    total.dbnos += Number(row.dbnos || 0);
    total.botDbnosIgnored += Number(row.botDbnosIgnored || 0);
  }
  total.score = calculateScore(total);
  return total;
}

async function refreshCleanPlayerStats(playerId, seasonId, gameMode) {
  const rows = await prisma.cleanPlayerMatchStats.findMany({ where: { playerId } });
  const total = sumCleanRows(rows);

  await prisma.cleanPlayerStats.upsert({
    where: { playerId },
    update: { ...total, seasonId, gameMode },
    create: { playerId, ...total, seasonId, gameMode }
  });

  return total;
}

function buildInitialPlayerStats(playersInMatch, participantByAccountId) {
  const byAccountId = new Map();

  for (const player of playersInMatch) {
    const clean = emptyCleanStats();
    const participant = participantByAccountId.get(player.pubgAccountId) || {};
    const place = Number(participant.winPlace || 0);
    clean.matchesPlayed = 1;
    clean.wins = place === 1 ? 1 : 0;
    clean.top10s = place > 0 && place <= 10 ? 1 : 0;
    clean.deaths = participant.deathType && participant.deathType !== 'alive' ? 1 : 0;
    clean.placement = place || null;
    byAccountId.set(player.pubgAccountId, { player, stats: clean });
  }

  return byAccountId;
}

function applyKillEvent(event, byAccountId, totals) {
  const killer = getKillKiller(event);
  const victim = getKillVictim(event);
  const killerAccountId = getAccountId(killer);
  const entry = byAccountId.get(killerAccountId);
  if (!entry) return;

  const victimTeamId = getTeamId(victim, { type: event._T, matchId: event.matchId, actor: 'victim', accountId: getAccountId(victim) });
  if (victimTeamId === null) return;

  const killerTeamId = getTeamId(killer, { type: event._T, matchId: event.matchId, actor: 'killer', accountId: killerAccountId });
  if (isBotTeam(victimTeamId)) {
    entry.stats.botKillsIgnored += 1;
    totals.botKillsIgnored += 1;
    return;
  }

  if (isSameTeam(victimTeamId, killerTeamId)) {
    entry.stats.teamKills += 1;
    return;
  }

  entry.stats.kills += 1;
  totals.kills += 1;
  if (isHeadshot(event)) entry.stats.headshotKills += 1;
  entry.stats.longestKill = Math.max(entry.stats.longestKill, distanceMeters(event.distance));
}

function applyGroggyEvent(event, byAccountId, totals) {
  const attacker = getGroggyAttacker(event);
  const victim = getKillVictim(event);
  const attackerAccountId = getAccountId(attacker);
  const entry = byAccountId.get(attackerAccountId);
  if (!entry) return;

  const victimTeamId = getTeamId(victim, { type: event._T, matchId: event.matchId, actor: 'victim', accountId: getAccountId(victim) });
  if (victimTeamId === null) return;

  const attackerTeamId = getTeamId(attacker, { type: event._T, matchId: event.matchId, actor: 'attacker', accountId: attackerAccountId });
  if (isBotTeam(victimTeamId)) {
    entry.stats.botDbnosIgnored += 1;
    totals.botDbnosIgnored += 1;
    return;
  }

  if (isSameTeam(victimTeamId, attackerTeamId)) return;
  entry.stats.dbnos += 1;
  totals.dbnos += 1;
}

function applyDamageEvent(event, byAccountId, totals) {
  const attacker = getDamageAttacker(event);
  const victim = getDamageVictim(event);
  const attackerAccountId = getAccountId(attacker);
  const victimAccountId = getAccountId(victim);
  const entry = byAccountId.get(attackerAccountId);
  if (!entry || !victimAccountId || attackerAccountId === victimAccountId) return;

  const victimTeamId = getTeamId(victim, { type: event._T, matchId: event.matchId, actor: 'victim', accountId: victimAccountId });
  if (victimTeamId === null) return;

  const attackerTeamId = getTeamId(attacker, { type: event._T, matchId: event.matchId, actor: 'attacker', accountId: attackerAccountId });
  const damage = eventDamage(event);
  if (!damage) return;

  if (isBotTeam(victimTeamId)) {
    entry.stats.botDamageIgnored += damage;
    totals.botDamageIgnored += damage;
    return;
  }

  if (isSameTeam(victimTeamId, attackerTeamId)) return;
  entry.stats.damage += damage;
  totals.damage += damage;
}

function applyTelemetryCleanStats(events, byAccountId) {
  const totals = {
    kills: 0,
    botKillsIgnored: 0,
    dbnos: 0,
    botDbnosIgnored: 0,
    damage: 0,
    botDamageIgnored: 0
  };

  if (!Array.isArray(events)) {
    logCleanWarn('Telemetry em formato inesperado; esperado array de eventos', { receivedType: typeof events });
    return totals;
  }

  for (const event of events) {
    try {
      const type = event?._T;
      if (!type) continue;

      if (type === 'LogPlayerKill' || type === 'LogPlayerKillV2') {
        applyKillEvent(event, byAccountId, totals);
        continue;
      }

      if (type === 'LogPlayerMakeGroggy') {
        applyGroggyEvent(event, byAccountId, totals);
        continue;
      }

      if (type === 'LogPlayerTakeDamage') {
        applyDamageEvent(event, byAccountId, totals);
        continue;
      }

      if (type === 'LogPlayerRevive') {
        const reviverAccountId = getAccountId(event.reviver);
        const entry = byAccountId.get(reviverAccountId);
        if (entry) entry.stats.revives += 1;
      }
    } catch (error) {
      logCleanWarn('Evento de telemetry ignorado por erro no parser', { type: event?._T, error: error.message });
    }
  }

  return totals;
}

export async function syncCleanGuild(guildId, options = {}) {
  const cfg = await prisma.guildConfig.upsert({
    where: { guildId },
    update: {},
    create: { guildId, platform: config.pubgShard, gameMode: config.pubgGameMode }
  });

  const shard = cfg.platform || config.pubgShard;
  const gameMode = cfg.gameMode || config.pubgGameMode;
  const seasonId = await getCurrentSeasonId(shard).catch((error) => {
    logCleanWarn('Não consegui obter a season atual; sync limpo continuará sem seasonId', { error: error.message });
    return null;
  });
  const players = await prisma.player.findMany({ where: { guildId, isActive: true } });
  if (!players.length) throw new Error('Nenhum jogador cadastrado no ranking.');

  const playerByAccountId = new Map(players.map((p) => [p.pubgAccountId, p]));
  const candidateMatchIds = new Map();
  // A PUBG API oficial só expõe partidas recentes dentro da janela de retenção dela.
  // Por padrão tentamos processar todas que vierem no player object, com limites de segurança
  // para não travar o bot caso muitos jogadores estejam cadastrados no servidor.
  const maxRecentPerPlayer = Math.min(Math.max(Number(options.maxRecentPerPlayer) || DEFAULT_MAX_RECENT_PER_PLAYER, 1), 100);
  const maxCandidateMatches = Math.min(Math.max(Number(options.maxCandidateMatches) || DEFAULT_MAX_CANDIDATE_MATCHES, 1), 500);
  const playerErrors = [];

  for (const player of players) {
    try {
      const ids = await getPlayerRecentMatchIds(player.pubgAccountId, player.platform || shard);
      ids.slice(0, maxRecentPerPlayer).forEach((matchId, index) => {
        const current = candidateMatchIds.get(matchId) || { matchId, bestIndex: index };
        current.bestIndex = Math.min(current.bestIndex, index);
        candidateMatchIds.set(matchId, current);
      });
      await new Promise((r) => setTimeout(r, 250));
    } catch (error) {
      playerErrors.push({ player, error: error.message });
      logCleanWarn('Falha buscando partidas recentes do jogador; seguindo com os demais', { player: player.pubgNick, error: error.message });
    }
  }

  const totalCandidateMatches = candidateMatchIds.size;
  const candidates = [...candidateMatchIds.values()].sort((a, b) => a.bestIndex - b.bestIndex).slice(0, maxCandidateMatches);
  const matchErrors = [];
  const changedPlayerIds = new Set();
  let processedMatches = 0;
  let skippedMatches = 0;
  let realKills = 0;
  let botKillsIgnored = 0;
  let realDbnos = 0;
  let botDbnosIgnored = 0;
  let cleanDamage = 0;
  let botDamageIgnored = 0;

  for (const candidate of candidates) {
    try {
      const match = await getMatch(candidate.matchId, shard);
      const attrs = match?.data?.attributes || {};
      if (gameMode && attrs.gameMode && attrs.gameMode !== gameMode) {
        skippedMatches += 1;
        continue;
      }

      const participants = participantMap(match);
      const playersInMatch = [...participants.keys()].map((accountId) => playerByAccountId.get(accountId)).filter(Boolean);
      if (!playersInMatch.length) {
        skippedMatches += 1;
        continue;
      }

      const existingMatch = await prisma.cleanMatch.findUnique({
        where: { guildId_matchId: { guildId, matchId: candidate.matchId } },
        include: { playerStats: true }
      });
      const existingPlayerIds = new Set((existingMatch?.playerStats || []).map((row) => row.playerId));
      const hasAllPlayers = playersInMatch.every((p) => existingPlayerIds.has(p.id));
      if (existingMatch?.processedAt && existingMatch.parserVersion === CLEAN_PARSER_VERSION && hasAllPlayers) {
        skippedMatches += 1;
        continue;
      }

      const telemetryUrl = findTelemetryUrl(match);
      if (!telemetryUrl) {
        skippedMatches += 1;
        logCleanWarn('Partida sem asset/telemetry; ignorada', { matchId: candidate.matchId });
        continue;
      }

      const byAccountId = buildInitialPlayerStats(playersInMatch, participants);
      let events = [];
      try {
        events = await getTelemetryEvents(telemetryUrl);
      } catch (error) {
        skippedMatches += 1;
        matchErrors.push({ matchId: candidate.matchId, error: error.message });
        logCleanWarn('Falha baixando telemetry; partida ignorada', { matchId: candidate.matchId, error: error.message });
        continue;
      }

      const matchTotals = applyTelemetryCleanStats(events, byAccountId);
      realKills += matchTotals.kills;
      botKillsIgnored += matchTotals.botKillsIgnored;
      realDbnos += matchTotals.dbnos;
      botDbnosIgnored += matchTotals.botDbnosIgnored;
      cleanDamage += matchTotals.damage;
      botDamageIgnored += matchTotals.botDamageIgnored;

      const cleanMatch = await prisma.cleanMatch.upsert({
        where: { guildId_matchId: { guildId, matchId: candidate.matchId } },
        update: {
          mapName: attrs.mapName || null,
          gameMode: attrs.gameMode || gameMode,
          playedAt: attrs.createdAt ? new Date(attrs.createdAt) : null,
          processedAt: new Date(),
          parserVersion: CLEAN_PARSER_VERSION
        },
        create: {
          guildId,
          matchId: candidate.matchId,
          mapName: attrs.mapName || null,
          gameMode: attrs.gameMode || gameMode,
          playedAt: attrs.createdAt ? new Date(attrs.createdAt) : null,
          processedAt: new Date(),
          parserVersion: CLEAN_PARSER_VERSION
        }
      });

      for (const { player, stats } of byAccountId.values()) {
        stats.score = calculateScore(stats);

        await prisma.cleanPlayerMatchStats.upsert({
          where: { cleanMatchId_playerId: { cleanMatchId: cleanMatch.id, playerId: player.id } },
          update: { ...stats },
          create: { cleanMatchId: cleanMatch.id, playerId: player.id, ...stats }
        });
        changedPlayerIds.add(player.id);
      }

      processedMatches += 1;
      await new Promise((r) => setTimeout(r, 700));
    } catch (error) {
      matchErrors.push({ matchId: candidate.matchId, error: error.message });
      logCleanWarn('Erro geral processando partida; seguindo sync', { matchId: candidate.matchId, error: error.message });
    }
  }

  const updatedPlayers = [];
  for (const playerId of changedPlayerIds) {
    try {
      const total = await refreshCleanPlayerStats(playerId, seasonId, gameMode);
      updatedPlayers.push({ playerId, total });
    } catch (error) {
      matchErrors.push({ matchId: 'refresh-stats', error: `Player ${playerId}: ${error.message}` });
    }
  }

  return {
    seasonId,
    gameMode,
    parserVersion: CLEAN_PARSER_VERSION,
    candidateMatches: candidates.length,
    foundMatches: candidates.length,
    totalCandidateMatches,
    maxRecentPerPlayer,
    maxCandidateMatches,
    retentionWindowDays: 14,
    processedMatches,
    skippedMatches,
    updatedPlayers,
    realKills,
    botKillsIgnored,
    realDbnos,
    botDbnosIgnored,
    cleanDamage,
    botDamageIgnored,
    playerErrors,
    errors: matchErrors
  };
}

export async function getCleanRanking(guildId, orderBy = 'score', limit = 10) {
  const field = CLEAN_ORDER_FIELDS.has(orderBy) ? orderBy : 'score';
  return prisma.cleanPlayerStats.findMany({
    where: { player: { guildId, isActive: true } },
    include: { player: true },
    orderBy: { [field]: 'desc' },
    take: Math.min(Math.max(Number(limit) || 10, 1), 25)
  });
}

export async function getCleanTopRanking(guildId, orderBy = 'kills', limit = 10) {
  return getCleanRanking(guildId, orderBy, limit);
}

export async function getCleanPlayerStatsByDiscord(guildId, discordId) {
  return prisma.player.findUnique({
    where: { guildId_discordId: { guildId, discordId } },
    include: { stats: true, cleanStats: true }
  });
}
