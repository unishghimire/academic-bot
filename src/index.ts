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
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`🌐 Academy Control Center: http://0.0.0.0:${env.PORT}/admin`);
    logger.info(`💳 Student Payment Portal: http://0.0.0.0:${env.PORT}/submit-proof.html`);
    logger.info(`📡 Video Progress API: http://0.0.0.0:${env.PORT}/api/progress/watch`);
    logger.info(`📡 Account Linking API: http://0.0.0.0:${env.PORT}/api/link/verify`);
    if (env.STRIPE_SECRET_KEY) {
      logger.info(`📡 Stripe Webhook: http://0.0.0.0:${env.PORT}/webhooks/stripe`);
    }
  });

  // 3. Automated 24/7 Keep-Alive Self-Pinger for Render / Cloud Hosts
  const keepAliveTarget = env.RENDER_EXTERNAL_URL || env.APP_URL;
  if (keepAliveTarget) {
    const pingUrl = `${keepAliveTarget.replace(/\/$/, '')}/health`;
    logger.info({ pingUrl }, '🕒 Initializing 24/7 keep-alive worker to prevent host spin-down (every 5 mins)...');
    setInterval(async () => {
      try {
        const res = await fetch(pingUrl);
        if (res.ok) {
          logger.info({ status: res.status }, '💓 Keep-alive self-ping successful: service kept active 24/7');
        }
      } catch (err: any) {
        logger.warn({ err: err.message }, 'Keep-alive self-ping attempt failed');
      }
    }, 5 * 60 * 1000);
  }

  // 4. Start Discord Bot
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
