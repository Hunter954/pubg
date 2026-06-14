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
  const valid = new Set(['score', 'kills', 'damage', 'wins', 'assists', 'revives', 'longestKill', 'matchesPlayed']);
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
