import { prisma } from '../db.js';
import { config } from '../config.js';
import { calculateScore } from '../utils/score.js';
import { getCurrentSeasonId, getPlayerRecentMatchIds, getMatch, getTelemetryEvents } from './pubgApi.js';

const CLEAN_ORDER_FIELDS = new Set([
  'score', 'kills', 'damage', 'wins', 'top10s', 'revives', 'longestKill',
  'matchesPlayed', 'deaths', 'teamKills', 'headshotKills', 'dbnos', 'botKillsIgnored', 'botDbnosIgnored'
]);

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

function getAccountId(character) {
  return character?.accountId || character?.accountIdString || character?.playerId || null;
}

function getTeamId(character) {
  const value = character?.teamId;
  const teamId = Number(value);
  return Number.isFinite(teamId) ? teamId : null;
}

function isBotTeam(teamId) {
  return Number.isFinite(Number(teamId)) && Number(teamId) >= 200;
}

function isHeadshot(event) {
  return String(event.damageReason || event.reason || '').toLowerCase().includes('headshot');
}

function distanceMeters(value) {
  const distance = Number(value || 0);
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  // PUBG telemetry geralmente envia distância em centímetros nos eventos de kill.
  return distance > 1000 ? distance / 100 : distance;
}

function sumCleanRows(rows) {
  const total = emptyCleanStats();
  for (const row of rows) {
    total.kills += Number(row.kills || 0);
    total.botKillsIgnored += Number(row.botKillsIgnored || 0);
    total.assists += Number(row.assists || 0);
    total.damage += Number(row.damage || 0);
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

function buildInitialPlayerStats(match, playersInMatch, participantByAccountId) {
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

function applyTelemetryCleanStats(events, byAccountId) {
  for (const event of events) {
    const type = event._T;

    if (type === 'LogPlayerKill') {
      const killerAccountId = getAccountId(event.killer);
      const victimTeamId = getTeamId(event.victim);
      const killerTeamId = getTeamId(event.killer);
      const entry = byAccountId.get(killerAccountId);
      if (!entry) continue;

      if (isBotTeam(victimTeamId)) {
        entry.stats.botKillsIgnored += 1;
        continue;
      }

      if (victimTeamId !== null && killerTeamId !== null && victimTeamId === killerTeamId) {
        entry.stats.teamKills += 1;
        continue;
      }

      entry.stats.kills += 1;
      if (isHeadshot(event)) entry.stats.headshotKills += 1;
      entry.stats.longestKill = Math.max(entry.stats.longestKill, distanceMeters(event.distance));
    }

    if (type === 'LogPlayerMakeGroggy') {
      const attackerAccountId = getAccountId(event.attacker);
      const victimTeamId = getTeamId(event.victim);
      const attackerTeamId = getTeamId(event.attacker);
      const entry = byAccountId.get(attackerAccountId);
      if (!entry) continue;

      if (isBotTeam(victimTeamId)) {
        entry.stats.botDbnosIgnored += 1;
        continue;
      }

      if (victimTeamId !== null && attackerTeamId !== null && victimTeamId === attackerTeamId) continue;
      entry.stats.dbnos += 1;
    }

    if (type === 'LogPlayerTakeDamage') {
      const attackerAccountId = getAccountId(event.attacker);
      const victimAccountId = getAccountId(event.victim);
      const victimTeamId = getTeamId(event.victim);
      const attackerTeamId = getTeamId(event.attacker);
      const entry = byAccountId.get(attackerAccountId);
      if (!entry || !victimAccountId || attackerAccountId === victimAccountId) continue;
      if (isBotTeam(victimTeamId)) continue;
      if (victimTeamId !== null && attackerTeamId !== null && victimTeamId === attackerTeamId) continue;
      entry.stats.damage += Math.max(0, Number(event.damage || 0));
    }

    if (type === 'LogPlayerRevive') {
      const reviverAccountId = getAccountId(event.reviver);
      const entry = byAccountId.get(reviverAccountId);
      if (!entry) continue;
      entry.stats.revives += 1;
    }
  }
}

export async function syncCleanGuild(guildId, options = {}) {
  const cfg = await prisma.guildConfig.upsert({
    where: { guildId },
    update: {},
    create: { guildId, platform: config.pubgShard, gameMode: config.pubgGameMode }
  });

  const shard = cfg.platform || config.pubgShard;
  const gameMode = cfg.gameMode || config.pubgGameMode;
  const seasonId = await getCurrentSeasonId(shard).catch(() => null);
  const players = await prisma.player.findMany({ where: { guildId, isActive: true } });
  if (!players.length) throw new Error('Nenhum jogador cadastrado no ranking.');

  const playerByAccountId = new Map(players.map((p) => [p.pubgAccountId, p]));
  const candidateMatchIds = new Map();
  const maxRecentPerPlayer = Math.min(Math.max(Number(options.maxRecentPerPlayer) || 10, 1), 20);

  for (const player of players) {
    try {
      const ids = await getPlayerRecentMatchIds(player.pubgAccountId, player.platform || shard);
      ids.slice(0, maxRecentPerPlayer).forEach((matchId, index) => {
        const current = candidateMatchIds.get(matchId) || { matchId, bestIndex: index };
        current.bestIndex = Math.min(current.bestIndex, index);
        candidateMatchIds.set(matchId, current);
      });
      await new Promise((r) => setTimeout(r, 250));
    } catch (_) {
      // Se um jogador falhar, seguimos com os demais para não travar o sync limpo.
    }
  }

  const candidates = [...candidateMatchIds.values()].sort((a, b) => a.bestIndex - b.bestIndex).slice(0, 30);
  const results = [];
  const changedPlayerIds = new Set();
  let processedMatches = 0;
  let skippedMatches = 0;
  let botKillsIgnored = 0;
  let botDbnosIgnored = 0;

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
      if (existingMatch?.processedAt && hasAllPlayers) {
        skippedMatches += 1;
        continue;
      }

      const telemetryUrl = findTelemetryUrl(match);
      if (!telemetryUrl) {
        skippedMatches += 1;
        continue;
      }

      const byAccountId = buildInitialPlayerStats(match, playersInMatch, participants);
      const events = await getTelemetryEvents(telemetryUrl);
      applyTelemetryCleanStats(events, byAccountId);

      const cleanMatch = await prisma.cleanMatch.upsert({
        where: { guildId_matchId: { guildId, matchId: candidate.matchId } },
        update: {
          mapName: attrs.mapName || null,
          gameMode: attrs.gameMode || gameMode,
          playedAt: attrs.createdAt ? new Date(attrs.createdAt) : null,
          processedAt: new Date()
        },
        create: {
          guildId,
          matchId: candidate.matchId,
          mapName: attrs.mapName || null,
          gameMode: attrs.gameMode || gameMode,
          playedAt: attrs.createdAt ? new Date(attrs.createdAt) : null,
          processedAt: new Date()
        }
      });

      for (const { player, stats } of byAccountId.values()) {
        stats.score = calculateScore(stats);
        botKillsIgnored += stats.botKillsIgnored;
        botDbnosIgnored += stats.botDbnosIgnored;

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
      results.push({ matchId: candidate.matchId, ok: false, error: error.message });
    }
  }

  const updatedPlayers = [];
  for (const playerId of changedPlayerIds) {
    const total = await refreshCleanPlayerStats(playerId, seasonId, gameMode);
    updatedPlayers.push({ playerId, total });
  }

  return {
    seasonId,
    gameMode,
    candidateMatches: candidates.length,
    processedMatches,
    skippedMatches,
    updatedPlayers,
    botKillsIgnored,
    botDbnosIgnored,
    errors: results.filter((r) => !r.ok)
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
    include: { cleanStats: true }
  });
}
