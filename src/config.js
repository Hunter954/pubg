import 'dotenv/config';

export const config = {
  discordToken: process.env.DISCORD_TOKEN,
  discordClientId: process.env.DISCORD_CLIENT_ID,
  discordGuildId: process.env.DISCORD_GUILD_ID || null,
  adminRoleId: process.env.ADMIN_ROLE_ID || null,
  pubgApiKey: process.env.PUBG_API_KEY,
  pubgShard: process.env.PUBG_SHARD || 'steam',
  pubgGameMode: process.env.PUBG_GAME_MODE || 'squad-fpp',
  port: Number(process.env.PORT || 3000),
  roleIds: {
    bronze: process.env.ROLE_BRONZE_ID || null,
    prata: process.env.ROLE_PRATA_ID || null,
    ouro: process.env.ROLE_OURO_ID || null,
    lenda: process.env.ROLE_LENDA_ID || null
  }
};

export function validateEnv() {
  const missing = [];
  if (!config.discordToken) missing.push('DISCORD_TOKEN');
  if (!config.discordClientId) missing.push('DISCORD_CLIENT_ID');
  if (!config.pubgApiKey) missing.push('PUBG_API_KEY');
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (missing.length) {
    throw new Error(`Variáveis ausentes: ${missing.join(', ')}`);
  }
}
