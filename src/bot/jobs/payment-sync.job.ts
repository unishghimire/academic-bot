import { Client } from 'discord.js';
import { paymentVerificationSyncService } from '../../services/payment-verification-sync.service.js';
import { logger } from '../../utils/logger.js';

export function initPaymentSyncJob(client: Client): NodeJS.Timeout {
  logger.info('Initializing automated database Payment Verification Sync worker (30s interval)...');

  // Run once immediately on startup
  paymentVerificationSyncService
    .syncApprovedPayments(client)
    .then(res => {
      if (res.rolesAssigned > 0) {
        logger.info({ rolesAssigned: res.rolesAssigned }, 'Initial payment verification sync completed');
      }
    })
    .catch(err => logger.warn({ err }, 'Initial payment verification sync encountered an issue'));

  // Run every 30 seconds
  const interval = setInterval(async () => {
    try {
      const res = await paymentVerificationSyncService.syncApprovedPayments(client);
      if (res.rolesAssigned > 0) {
        logger.info({ rolesAssigned: res.rolesAssigned }, 'Synced newly approved payments from database to Discord roles');
      }
    } catch (error) {
      logger.error({ error }, 'Error in automated payment verification sync worker');
    }
  }, 30000);

  return interval;
}
