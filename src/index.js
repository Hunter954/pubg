import { Client, GatewayIntentBits, Events } from 'discord.js';
import { config, validateEnv } from './config.js';
import { handleInteraction } from './commands/handlers.js';
import { startHealthServer } from './server.js';
import { startSyncJobs } from './jobs/hourlySync.js';

validateEnv();
startHealthServer();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot online como ${readyClient.user.tag}`);
  startSyncJobs(client);
});

client.on(Events.InteractionCreate, handleInteraction);

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

client.login(config.discordToken);
