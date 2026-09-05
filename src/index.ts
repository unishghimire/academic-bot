import { env } from './config/env.js';
import { checkDbConnection } from './db/client.js';
import { createDiscordClient, startBot } from './bot/client.js';
import { createApiServer } from './api/server.js';
import { logger } from './utils/logger.js';

async function main() {
  logger.info('🚀 Bootstrapping Custom Academy Bot & Backend System...');

  // 1. Initialize Discord Bot Client
  const discordClient = createDiscordClient();

  // 2. Initialize & Start API Server immediately
  const app = createApiServer(discordClient);
  const server = app.listen(env.PORT, () => {
    logger.info(`🌐 Academy Control Center: http://localhost:${env.PORT}/admin`);
    logger.info(`💳 Student Payment Portal: http://localhost:${env.PORT}/submit-proof.html`);
    logger.info(`📡 Video Progress API: http://localhost:${env.PORT}/api/progress/watch`);
    logger.info(`📡 Account Linking API: http://localhost:${env.PORT}/api/link/verify`);
    if (env.STRIPE_SECRET_KEY) {
      logger.info(`📡 Stripe Webhook: http://localhost:${env.PORT}/webhooks/stripe`);
    }
  });

  // 3. Start Discord Bot
  await startBot(discordClient);

  // 4. Verify PostgreSQL Database connection in background
  checkDbConnection().then(dbConnected => {
    if (!dbConnected) {
      logger.warn('⚠️ PostgreSQL connection failed. Please ensure valid password in DATABASE_URL in .env.');
    }
  }).catch(() => {});

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

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
  });

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(err => {
  logger.fatal({ err }, 'Fatal error during bootstrap');
  process.exit(1);
});
