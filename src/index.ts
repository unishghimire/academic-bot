import { env } from './config/env.js';
import { checkDbConnection } from './db/client.js';
import { createDiscordClient, startBot } from './bot/client.js';
import { createApiServer } from './api/server.js';
import { logger } from './utils/logger.js';

async function main() {
  logger.info('🚀 Bootstrapping Custom Academy Bot & Backend System...');

  // 1. Check PostgreSQL Database connection
  const dbConnected = await checkDbConnection();
  if (!dbConnected) {
    logger.warn('⚠️ PostgreSQL connection failed. Please ensure DATABASE_URL is configured.');
  }

  // 2. Initialize Discord Bot Client
  const discordClient = createDiscordClient();

  // 3. Initialize & Start API Server
  const app = createApiServer(discordClient);
  const server = app.listen(env.PORT, () => {
    logger.info(`🌐 Webhook & API server listening on http://localhost:${env.PORT}`);
    logger.info(`📡 Stripe Webhook endpoint: http://localhost:${env.PORT}/webhooks/stripe`);
    logger.info(`📡 Video Progress API: http://localhost:${env.PORT}/api/progress/watch`);
    logger.info(`📡 Account Linking API: http://localhost:${env.PORT}/api/link/verify`);
  });

  // 4. Start Discord Bot
  await startBot(discordClient);

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal. Cleaning up resources...');
    server.close(() => {
      logger.info('API server closed.');
    });
    if (discordClient.isReady()) {
      discordClient.destroy();
      logger.info('Discord client destroyed.');
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(err => {
  logger.fatal({ err }, 'Fatal error during bootstrap');
  process.exit(1);
});
