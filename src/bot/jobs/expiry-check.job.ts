import cron from 'node-cron';
import { Client } from 'discord.js';
import { subscriptionService } from '../../services/subscription.service.js';
import { roleSyncService } from '../../services/role-sync.service.js';
import { errorLogger } from '../../services/error-logger.service.js';
import { createWarningEmbed } from '../../utils/embed-builder.js';
import { logger } from '../../utils/logger.js';

export function initExpiryCheckJob(client: Client): cron.ScheduledTask {
  // Run daily at midnight UTC
  const task = cron.schedule('0 0 * * *', async () => {
    logger.info('Starting daily subscription expiry check and sweep...');

    try {
      // 1. Sweep expired users
      const expiredUserIds = await subscriptionService.sweepExpiredSubscriptions();

      // Trigger role sync to strip roles for swept users
      for (const userId of expiredUserIds) {
        await roleSyncService.syncUserRoles(userId, client).catch(() => {});
      }

      // 2. Throttled warning notifications (7 days, 3 days, 24 hours)
      const warningWindows = [24, 72, 168]; // hours
      for (const hours of warningWindows) {
        const expiringUsers = await subscriptionService.findExpiringUsers(hours);

        for (const u of expiringUsers) {
          if (!u.discordId) continue;
          try {
            const discordUser = await client.users.fetch(u.discordId).catch(() => null);
            if (discordUser) {
              const daysLeft = Math.ceil(hours / 24);
              const embed = createWarningEmbed(
                'Academy Subscription Renewal Reminder',
                `Your Academy Premium subscription expires in **${daysLeft} day(s)** on <t:${Math.floor(u.expiresAt.getTime() / 1000)}:F>.\n\n` +
                `Renew now to keep your access to AI video classes, community tiers, and prompt packs without interruption.\n` +
                `👉 **[Click Here to Renew Your Subscription](https://academy.example.com/billing)**\n\n` +
                `*Note: Your completed lessons, XP, streak, and tier progress will remain permanently preserved even if your subscription expires.*`
              );
              await discordUser.send({ embeds: [embed] }).catch(() => {});
            }
          } catch {
            // Ignore DM failure if user has closed DMs
          }
        }
      }

      logger.info('Daily subscription expiry sweep completed.');
    } catch (error) {
      await errorLogger.report(client, {
        module: 'EXPIRY_JOB',
        action: 'DAILY_SWEEP',
        error,
      });
    }
  });

  return task;
}
