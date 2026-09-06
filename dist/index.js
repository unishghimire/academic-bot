"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_js_1 = require("./config/env.js");
const client_js_1 = require("./db/client.js");
const client_js_2 = require("./bot/client.js");
const server_js_1 = require("./api/server.js");
const logger_js_1 = require("./utils/logger.js");
async function main() {
    logger_js_1.logger.info('🚀 Bootstrapping Custom Academy Bot & Backend System...');
    // 1. Initialize Discord Bot Client
    const discordClient = (0, client_js_2.createDiscordClient)();
    // 2. Initialize & Start API Server immediately
    const app = (0, server_js_1.createApiServer)(discordClient);
    const server = app.listen(env_js_1.env.PORT, '0.0.0.0', () => {
        logger_js_1.logger.info(`🌐 Academy Control Center: http://0.0.0.0:${env_js_1.env.PORT}/admin`);
        logger_js_1.logger.info(`💳 Student Payment Portal: ${env_js_1.env.STUDENT_PORTAL_URL}`);
        logger_js_1.logger.info(`📡 Video Progress API: http://0.0.0.0:${env_js_1.env.PORT}/api/progress/watch`);
        logger_js_1.logger.info(`📡 Account Linking API: http://0.0.0.0:${env_js_1.env.PORT}/api/link/verify`);
        if (env_js_1.env.STRIPE_SECRET_KEY) {
            logger_js_1.logger.info(`📡 Stripe Webhook: http://0.0.0.0:${env_js_1.env.PORT}/webhooks/stripe`);
        }
    });
    // 3. Automated 24/7 Keep-Alive Self-Pinger for Render / Cloud Hosts
    const keepAliveTarget = env_js_1.env.RENDER_EXTERNAL_URL || env_js_1.env.APP_URL;
    if (keepAliveTarget) {
        const pingUrl = `${keepAliveTarget.replace(/\/$/, '')}/health`;
        logger_js_1.logger.info({ pingUrl }, '🕒 Initializing 24/7 keep-alive worker to prevent host spin-down (every 5 mins)...');
        setInterval(async () => {
            try {
                const res = await fetch(pingUrl);
                if (res.ok) {
                    logger_js_1.logger.info({ status: res.status }, '💓 Keep-alive self-ping successful: service kept active 24/7');
                }
            }
            catch (err) {
                logger_js_1.logger.warn({ err: err.message }, 'Keep-alive self-ping attempt failed');
            }
        }, 5 * 60 * 1000);
    }
    // 4. Start Discord Bot
    await (0, client_js_2.startBot)(discordClient);
    // 4. Verify PostgreSQL Database connection in background
    (0, client_js_1.checkDbConnection)().then(dbConnected => {
        if (!dbConnected) {
            logger_js_1.logger.warn('⚠️ PostgreSQL connection failed. Please ensure valid password in DATABASE_URL in .env.');
        }
    }).catch(() => { });
    // Graceful shutdown handlers
    const shutdown = async (signal) => {
        logger_js_1.logger.info({ signal }, 'Received shutdown signal. Cleaning up resources...');
        server.close(() => {
            logger_js_1.logger.info('API server closed.');
        });
        if (discordClient.isReady()) {
            discordClient.destroy();
            logger_js_1.logger.info('Discord client destroyed.');
        }
        process.exit(0);
    };
    process.on('unhandledRejection', (reason) => {
        logger_js_1.logger.error({ reason }, 'Unhandled promise rejection');
    });
    process.on('uncaughtException', (err) => {
        logger_js_1.logger.error({ err }, 'Uncaught exception');
    });
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
main().catch(err => {
    logger_js_1.logger.fatal({ err }, 'Fatal error during bootstrap');
    process.exit(1);
});
//# sourceMappingURL=index.js.map