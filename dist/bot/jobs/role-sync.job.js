"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initRoleSyncJob = initRoleSyncJob;
const node_cron_1 = __importDefault(require("node-cron"));
const role_sync_service_js_1 = require("../../services/role-sync.service.js");
const logger_js_1 = require("../../utils/logger.js");
const error_logger_service_js_1 = require("../../services/error-logger.service.js");
function initRoleSyncJob(client) {
    // Run every 10 minutes
    const task = node_cron_1.default.schedule('*/10 * * * *', async () => {
        logger_js_1.logger.info('Starting scheduled role reconciliation sweep...');
        try {
            const { total, corrected } = await role_sync_service_js_1.roleSyncService.syncAllLinkedUsers(client);
            logger_js_1.logger.info({ total, corrected }, 'Scheduled role reconciliation finished');
        }
        catch (error) {
            await error_logger_service_js_1.errorLogger.report(client, {
                module: 'ROLE_SYNC_JOB',
                action: 'SCHEDULED_SWEEP',
                error,
            });
        }
    });
    return task;
}
//# sourceMappingURL=role-sync.job.js.map