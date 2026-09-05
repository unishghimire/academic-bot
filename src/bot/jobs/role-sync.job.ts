import cron from 'node-cron';
import { Client } from 'discord.js';
import { roleSyncService } from '../../services/role-sync.service.js';
import { logger } from '../../utils/logger.js';
import { errorLogger } from '../../services/error-logger.service.js';

export function initRoleSyncJob(client: Client): cron.ScheduledTask {
  // Run every 10 minutes
  const task = cron.schedule('*/10 * * * *', async () => {
    logger.info('Starting scheduled role reconciliation sweep...');
    try {
      const { total, corrected } = await roleSyncService.syncAllLinkedUsers(client);
      logger.info({ total, corrected }, 'Scheduled role reconciliation finished');
    } catch (error) {
      await errorLogger.report(client, {
        module: 'ROLE_SYNC_JOB',
        action: 'SCHEDULED_SWEEP',
        error,
      });
    }
  });

  return task;
}
