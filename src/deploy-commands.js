import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commands } from './commands/definitions.js';
import { config, validateEnv } from './config.js';

validateEnv();

const rest = new REST({ version: '10' }).setToken(config.discordToken);

async function main() {
  console.log(`Registrando ${commands.length} comandos slash...`);

  if (config.discordGuildId) {
    await rest.put(
      Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
      { body: commands }
    );
    console.log(`Comandos registrados no servidor ${config.discordGuildId}.`);
  } else {
    await rest.put(
      Routes.applicationCommands(config.discordClientId),
      { body: commands }
    );
    console.log('Comandos globais registrados. Pode levar até 1h para aparecerem em todos os servidores.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
