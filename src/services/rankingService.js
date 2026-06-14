import { prisma } from '../db.js';
import { calculateScore } from '../utils/score.js';
import { config } from '../config.js';
import { getCurrentSeasonId, getPlayerSeasonStats, normalizeGameModeStats } from './pubgApi.js';

export async function syncGuild(guildId) {
  const cfg = await prisma.guildConfig.upsert({
    where: { guildId },
    update: {},
    create: { guildId, platform: config.pubgShard, gameMode: config.pubgGameMode }
  });

  const players = await prisma.player.findMany({ where: { guildId, isActive: true } });
  const seasonId = await getCurrentSeasonId(cfg.platform || config.pubgShard);
  if (!seasonId) throw new Error('Não consegui identificar a temporada atual na PUBG API.');

  const results = [];
  for (const player of players) {
    try {
      const allModes = await getPlayerSeasonStats(player.pubgAccountId, seasonId, player.platform || cfg.platform);
      const selectedMode = cfg.gameMode || config.pubgGameMode;
      const rawModeStats = allModes[selectedMode] || allModes[config.pubgGameMode] || allModes['squad-fpp'] || allModes['squad'] || allModes['squad-tpp'] || {};
      const usedMode = allModes[selectedMode] ? selectedMode : (allModes[config.pubgGameMode] ? config.pubgGameMode : (allModes['squad-fpp'] ? 'squad-fpp' : (allModes['squad'] ? 'squad' : (allModes['squad-tpp'] ? 'squad-tpp' : selectedMode))));
      const normalized = normalizeGameModeStats(rawModeStats);
      const score = calculateScore(normalized);

      await prisma.playerStats.upsert({
        where: { playerId: player.id },
        update: { ...normalized, score, seasonId, gameMode: usedMode, raw: rawModeStats },
        create: { playerId: player.id, ...normalized, score, seasonId, gameMode: usedMode, raw: rawModeStats }
      });

      await prisma.statSnapshot.create({
        data: { playerId: player.id, ...normalized, score, seasonId, gameMode: usedMode, raw: rawModeStats }
      });

      results.push({ player, ok: true, score, gameMode: usedMode });
      await new Promise((r) => setTimeout(r, 700));
    } catch (error) {
      results.push({ player, ok: false, error: error.message });
    }
  }

  return { seasonId, gameMode: cfg.gameMode, total: players.length, results };
}

export async function getRanking(guildId, orderBy = 'score', limit = 10) {
  const valid = new Set(['score', 'kills', 'damage', 'wins', 'assists', 'revives', 'longestKill', 'matchesPlayed', 'deaths', 'teamKills', 'headshotKills', 'dbnos']);
  const field = valid.has(orderBy) ? orderBy : 'score';
  return prisma.playerStats.findMany({
    where: { player: { guildId, isActive: true } },
    include: { player: true },
    orderBy: { [field]: 'desc' },
    take: Math.min(Math.max(Number(limit) || 10, 1), 25)
  });
}

export async function getPlayerStatsByDiscord(guildId, discordId) {
  return prisma.player.findUnique({
    where: { guildId_discordId: { guildId, discordId } },
    include: { stats: true }
  });
}

export async function getMvp(guildId) {
  const rows = await getRanking(guildId, 'score', 1);
  return rows[0] || null;
}

export async function getTopRanking(guildId, orderBy = 'kills', limit = 10) {
  const valid = new Set(['score', 'kills', 'damage', 'wins', 'assists', 'revives', 'longestKill', 'matchesPlayed', 'deaths', 'teamKills', 'headshotKills', 'dbnos']);
  const field = valid.has(orderBy) ? orderBy : 'kills';
  return prisma.playerStats.findMany({
    where: { player: { guildId, isActive: true } },
    include: { player: true },
    orderBy: { [field]: 'desc' },
    take: Math.min(Math.max(Number(limit) || 10, 1), 25)
  });
}

export async function getPlayerEvolution(guildId, discordId, days = 7) {
  const player = await prisma.player.findUnique({
    where: { guildId_discordId: { guildId, discordId } },
    include: { stats: true }
  });
  if (!player) return null;

  const since = new Date(Date.now() - Math.max(Number(days) || 7, 1) * 24 * 60 * 60 * 1000);
  const first = await prisma.statSnapshot.findFirst({
    where: { playerId: player.id, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' }
  });
  const last = await prisma.statSnapshot.findFirst({
    where: { playerId: player.id },
    orderBy: { createdAt: 'desc' }
  });

  if (!first || !last || first.id === last.id) return { player, delta: null, since };

  const delta = {
    kills: Math.max(0, last.kills - first.kills),
    assists: Math.max(0, last.assists - first.assists),
    damage: Math.max(0, last.damage - first.damage),
    wins: Math.max(0, last.wins - first.wins),
    top10s: Math.max(0, last.top10s - first.top10s),
    revives: Math.max(0, last.revives - first.revives),
    matchesPlayed: Math.max(0, last.matchesPlayed - first.matchesPlayed),
    deaths: Math.max(0, last.deaths - first.deaths),
    teamKills: Math.max(0, last.teamKills - first.teamKills),
    headshotKills: Math.max(0, last.headshotKills - first.headshotKills),
    dbnos: Math.max(0, last.dbnos - first.dbnos),
    longestKill: Number(last.longestKill || 0) > Number(first.longestKill || 0) ? Number(last.longestKill || 0) : 0
  };
  delta.score = calculateScore(delta);

  return { player, delta, since, first, last };
}
