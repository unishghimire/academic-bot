"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initPaymentSyncJob = initPaymentSyncJob;
const payment_verification_sync_service_js_1 = require("../../services/payment-verification-sync.service.js");
const logger_js_1 = require("../../utils/logger.js");
function initPaymentSyncJob(client) {
    logger_js_1.logger.info('Initializing automated database Payment Verification Sync worker (30s interval)...');
    // Run once immediately on startup
    payment_verification_sync_service_js_1.paymentVerificationSyncService
        .syncApprovedPayments(client)
        .then(res => {
        if (res.rolesAssigned > 0) {
            logger_js_1.logger.info({ rolesAssigned: res.rolesAssigned }, 'Initial payment verification sync completed');
        }
    })
        .catch(err => logger_js_1.logger.warn({ err }, 'Initial payment verification sync encountered an issue'));
    // Run every 30 seconds
    const interval = setInterval(async () => {
        try {
            const res = await payment_verification_sync_service_js_1.paymentVerificationSyncService.syncApprovedPayments(client);
            if (res.rolesAssigned > 0) {
                logger_js_1.logger.info({ rolesAssigned: res.rolesAssigned }, 'Synced newly approved payments from database to Discord roles');
            }
        }
        catch (error) {
            logger_js_1.logger.error({ error }, 'Error in automated payment verification sync worker');
        }
    }, 30000);
    return interval;
}
//# sourceMappingURL=payment-sync.job.js.map