"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initExpiryCheckJob = initExpiryCheckJob;
const node_cron_1 = __importDefault(require("node-cron"));
const subscription_service_js_1 = require("../../services/subscription.service.js");
const role_sync_service_js_1 = require("../../services/role-sync.service.js");
const error_logger_service_js_1 = require("../../services/error-logger.service.js");
const embed_builder_js_1 = require("../../utils/embed-builder.js");
const logger_js_1 = require("../../utils/logger.js");
function initExpiryCheckJob(client) {
    // Run daily at midnight UTC
    const task = node_cron_1.default.schedule('0 0 * * *', async () => {
        logger_js_1.logger.info('Starting daily subscription expiry check and sweep...');
        try {
            // 1. Sweep expired users
            const expiredUserIds = await subscription_service_js_1.subscriptionService.sweepExpiredSubscriptions();
            // Trigger role sync to strip roles for swept users
            for (const userId of expiredUserIds) {
                await role_sync_service_js_1.roleSyncService.syncUserRoles(userId, client).catch(() => { });
            }
            // 2. Throttled warning notifications (7 days, 3 days, 24 hours)
            const warningWindows = [24, 72, 168]; // hours
            for (const hours of warningWindows) {
                const expiringUsers = await subscription_service_js_1.subscriptionService.findExpiringUsers(hours);
                for (const u of expiringUsers) {
                    if (!u.discordId)
                        continue;
                    try {
                        const discordUser = await client.users.fetch(u.discordId).catch(() => null);
                        if (discordUser) {
                            const daysLeft = Math.ceil(hours / 24);
                            const embed = (0, embed_builder_js_1.createWarningEmbed)('Academy Subscription Renewal Reminder', `Your Academy Premium subscription expires in **${daysLeft} day(s)** on <t:${Math.floor(u.expiresAt.getTime() / 1000)}:F>.\n\n` +
                                `Renew now to keep your access to AI video classes, community tiers, and prompt packs without interruption.\n` +
                                `👉 **[Click Here to Renew Your Subscription](https://academy.example.com/billing)**\n\n` +
                                `*Note: Your completed lessons, XP, streak, and tier progress will remain permanently preserved even if your subscription expires.*`);
                            await discordUser.send({ embeds: [embed] }).catch(() => { });
                        }
                    }
                    catch {
                        // Ignore DM failure if user has closed DMs
                    }
                }
            }
            logger_js_1.logger.info('Daily subscription expiry sweep completed.');
        }
        catch (error) {
            await error_logger_service_js_1.errorLogger.report(client, {
                module: 'EXPIRY_JOB',
                action: 'DAILY_SWEEP',
                error,
            });
        }
    });
    return task;
}
//# sourceMappingURL=expiry-check.job.js.map