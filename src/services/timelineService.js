import { prisma } from '../db.js';
import { config } from '../config.js';
import { getPlayerRecentMatchIds, getMatch, getTelemetryEvents } from './pubgApi.js';

function eventTime(event, startDate) {
  const when = new Date(event._D || event._T || Date.now());
  const base = startDate ? new Date(startDate) : when;
  const seconds = Math.max(0, Math.floor((when.getTime() - base.getTime()) / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function playerName(character) {
  return character?.name || character?.accountId || 'Player';
}

function mentionsFor(character, playerByAccountId) {
  const accountId = character?.accountId;
  const player = accountId ? playerByAccountId.get(accountId) : null;
  return player ? `<@${player.discordId}>` : playerName(character);
}

function findTelemetryUrl(match) {
  const asset = (match?.included || []).find((item) => item.type === 'asset' && item.attributes?.URL);
  return asset?.attributes?.URL || null;
}

function getRegisteredPlacement(match, accountIds) {
  const participants = (match?.included || []).filter((item) => item.type === 'participant');
  const places = [];
  for (const p of participants) {
    const stats = p.attributes?.stats || {};
    if (accountIds.has(stats.playerId) && Number.isFinite(Number(stats.winPlace))) {
      places.push(Number(stats.winPlace));
    }
  }
  if (!places.length) return null;
  return Math.min(...places);
}

function parseTimeline(events, players, limit = 15) {
  const playerByAccountId = new Map(players.map((p) => [p.pubgAccountId, p]));
  const accountIds = new Set(playerByAccountId.keys());
  const firstDate = events.find((event) => event._D)?._D || null;
  const lines = [];

  for (const event of events) {
    if (lines.length >= limit) break;
    const type = event._T;

    if (type === 'LogPlayerMakeGroggy') {
      const attacker = event.attacker;
      const victim = event.victim;
      if (!accountIds.has(attacker?.accountId) && !accountIds.has(victim?.accountId)) continue;
      const weapon = event.damageCauserName || 'arma desconhecida';
      lines.push(`${eventTime(event, firstDate)} — ${mentionsFor(attacker, playerByAccountId)} derrubou ${playerName(victim)} com **${weapon}**`);
    }

    if (type === 'LogPlayerKill') {
      const killer = event.killer;
      const victim = event.victim;
      if (!accountIds.has(killer?.accountId) && !accountIds.has(victim?.accountId)) continue;
      const weapon = event.damageCauserName || 'arma desconhecida';
      const distance = event.distance ? ` (${Math.round(Number(event.distance) / 100)}m)` : '';
      lines.push(`${eventTime(event, firstDate)} — ${mentionsFor(killer, playerByAccountId)} matou ${playerName(victim)} com **${weapon}**${distance}`);
    }

    if (type === 'LogPlayerRevive') {
      const reviver = event.reviver;
      const victim = event.victim;
      if (!accountIds.has(reviver?.accountId) && !accountIds.has(victim?.accountId)) continue;
      lines.push(`${eventTime(event, firstDate)} — ${mentionsFor(reviver, playerByAccountId)} reviveu ${mentionsFor(victim, playerByAccountId)}`);
    }
  }

  return lines;
}

export async function getLatestSquadTimeline(guildId, limit = 15) {
  const players = await prisma.player.findMany({ where: { guildId, isActive: true } });
  if (!players.length) throw new Error('Nenhum jogador cadastrado no ranking.');

  const matchMap = new Map();
  for (const player of players) {
    const ids = await getPlayerRecentMatchIds(player.pubgAccountId, player.platform || config.pubgShard).catch(() => []);
    ids.slice(0, 10).forEach((matchId, index) => {
      const entry = matchMap.get(matchId) || { matchId, players: new Set(), bestIndex: index };
      entry.players.add(player.id);
      entry.bestIndex = Math.min(entry.bestIndex, index);
      matchMap.set(matchId, entry);
    });
  }

  const candidates = [...matchMap.values()].sort((a, b) => b.players.size - a.players.size || a.bestIndex - b.bestIndex);
  if (!candidates.length) throw new Error('Não encontrei partidas recentes dos jogadores cadastrados.');

  const candidate = candidates[0];
  const match = await getMatch(candidate.matchId, config.pubgShard);
  const telemetryUrl = findTelemetryUrl(match);
  if (!telemetryUrl) throw new Error('A partida não trouxe asset de telemetry.');

  const events = await getTelemetryEvents(telemetryUrl);
  const lines = parseTimeline(events, players, limit);
  const accountIds = new Set(players.map((p) => p.pubgAccountId));
  const placement = getRegisteredPlacement(match, accountIds);
  const mapName = match?.data?.attributes?.mapName || 'Mapa desconhecido';
  const gameMode = match?.data?.attributes?.gameMode || 'modo desconhecido';

  if (placement) lines.push(`Final — Squad terminou em **#${placement}**`);

  return {
    matchId: candidate.matchId,
    mapName,
    gameMode,
    registeredPlayersInMatch: candidate.players.size,
    lines
  };
}
