import { prisma } from '../db.js';
import { config } from '../config.js';

export function ensureGuildConfig(guildId) {
  return prisma.guildConfig.upsert({
    where: { guildId },
    update: {},
    create: { guildId, platform: config.pubgShard, gameMode: config.pubgGameMode }
  });
}
