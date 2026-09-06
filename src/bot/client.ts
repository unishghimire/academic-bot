import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  Interaction,
} from 'discord.js';
import { env } from '../config/env.js';
import { commandMap } from './commands/index.js';
import { checkRateLimit } from './middleware/rate-limiter.js';
import { errorLogger } from '../services/error-logger.service.js';
import { initRoleSyncJob } from './jobs/role-sync.job.js';
import { initExpiryCheckJob } from './jobs/expiry-check.job.js';
import { initPaymentSyncJob } from './jobs/payment-sync.job.js';
import { deployCommands } from './deploy-commands.js';
import { logger } from '../utils/logger.js';
import { createErrorEmbed } from '../utils/embed-builder.js';

export function createDiscordClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
    ],
    partials: [Partials.GuildMember, Partials.User],
  });

  client.once(Events.ClientReady, async readyClient => {
    logger.info({ tag: readyClient.user.tag }, '🤖 Discord Custom Academy Bot is online and ready!');

    // Automatically synchronize slash commands if running with live credentials
    if (env.DISCORD_TOKEN !== 'mock_token') {
      try {
        await deployCommands();
      } catch (err) {
        logger.warn({ err }, 'Slash command auto-deployment on ready encountered an error');
      }
    }

    // Initialize scheduled cron and worker jobs
    initRoleSyncJob(client);
    initExpiryCheckJob(client);
    initPaymentSyncJob(client);
  });

  client.on(Events.Error, error => {
    logger.error({ err: error }, 'Discord client encountered a network or websocket error');
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commandMap.get(interaction.commandName);
    if (!command) {
      logger.warn({ command: interaction.commandName }, 'Unknown command received');
      return;
    }

    // Check rate limit (3s cooldown by default)
    if (!checkRateLimit(interaction, 3)) {
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error: any) {
      logger.error({ err: error, command: interaction.commandName }, 'Error executing slash command');

      await errorLogger.report(client, {
        module: 'COMMAND_ROUTER',
        action: interaction.commandName,
        discordId: interaction.user.id,
        error,
      });

      const errorReply = {
        embeds: [createErrorEmbed('An Error Occurred', 'There was an error while executing this command. Staff has been notified.')],
        ephemeral: true,
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(errorReply).catch(() => {});
      } else {
        await interaction.reply(errorReply).catch(() => {});
      }
    }
  });

  return client;
}

export async function startBot(client: Client): Promise<void> {
  if (env.DISCORD_TOKEN === 'mock_token') {
    logger.warn('DISCORD_TOKEN is set to mock_token. Discord bot login skipped for dev/mock mode.');
    return;
  }

  try {
    await client.login(env.DISCORD_TOKEN);
  } catch (error) {
    logger.error({ err: error }, 'Failed to login to Discord');
  }
}
