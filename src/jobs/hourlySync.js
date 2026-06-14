import cron from 'node-cron';
import { prisma } from '../db.js';
import { syncGuild, getRanking } from '../services/rankingService.js';
import { updateMemberRankRole } from '../services/roleService.js';

export function startSyncJobs(client) {
  // A cada hora no minuto 7, evitando o minuto cheio.
  cron.schedule('7 * * * *', async () => {
    console.log('[cron] Iniciando sync horário...');
    const guilds = await prisma.guildConfig.findMany();
    for (const cfg of guilds) {
      try {
        const result = await syncGuild(cfg.guildId);
        console.log(`[cron] Guild ${cfg.guildId}: ${result.results.filter((r) => r.ok).length}/${result.total} jogadores atualizados`);

        const guild = await client.guilds.fetch(cfg.guildId).catch(() => null);
        if (guild) {
          const ranking = await getRanking(cfg.guildId, 'score', 25);
          for (const row of ranking) {
            const member = await guild.members.fetch(row.player.discordId).catch(() => null);
            if (member) await updateMemberRankRole(guild, member, row.score);
          }
        }
      } catch (error) {
        console.error(`[cron] Erro na guild ${cfg.guildId}:`, error.message);
      }
    }
  });

  // Domingo 23h: posta ranking no canal configurado.
  cron.schedule('0 23 * * 0', async () => {
    console.log('[cron] Postando ranking semanal...');
    const guilds = await prisma.guildConfig.findMany({ where: { rankingChannelId: { not: null } } });
    for (const cfg of guilds) {
      const guild = await client.guilds.fetch(cfg.guildId).catch(() => null);
      const channel = guild ? await guild.channels.fetch(cfg.rankingChannelId).catch(() => null) : null;
      if (!channel?.isTextBased()) continue;

      const ranking = await getRanking(cfg.guildId, 'score', 10);
      if (!ranking.length) continue;
      const lines = ranking.map((r, i) => `${i + 1}. <@${r.player.discordId}> — **${r.score} pts** | ${r.kills} kills | ${Math.round(r.damage)} dano`).join('\n');
      await channel.send(`🏆 **Fechamento do Ranking PUBG**\n\n${lines}`);
    }
  });
}
