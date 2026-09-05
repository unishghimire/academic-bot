import { REST, Routes } from 'discord.js';
import { env } from '../config/env.js';
import { allCommands } from './commands/index.js';
import { logger } from '../utils/logger.js';

export async function deployCommands() {
  if (env.DISCORD_TOKEN === 'mock_token') {
    logger.warn('Skipping Discord command deployment: DISCORD_TOKEN is set to mock.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  const commandData = allCommands.map(cmd => cmd.data.toJSON());

  try {
    logger.info({ count: commandData.length }, 'Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID),
      { body: commandData }
    );

    logger.info('Successfully reloaded application (/) commands.');
  } catch (error) {
    logger.error({ err: error }, 'Failed to deploy Discord application commands.');
  }
}

if (process.argv[1]?.endsWith('deploy-commands.ts')) {
  deployCommands().then(() => process.exit(0));
}
