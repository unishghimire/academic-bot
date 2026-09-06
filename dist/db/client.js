"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.isDatabaseOnline = isDatabaseOnline;
exports.checkDbConnection = checkDbConnection;
const client_1 = require("@prisma/client");
const logger_js_1 = require("../utils/logger.js");
exports.prisma = global.prisma ||
    new client_1.PrismaClient({
        log: process.env.NODE_ENV === 'development'
            ? ['query', 'error', 'warn']
            : ['error'],
    });
if (process.env.NODE_ENV !== 'production') {
    global.prisma = exports.prisma;
}
let isDbOnline = false;
function isDatabaseOnline() {
    return isDbOnline;
}
async function checkDbConnection() {
    try {
        await exports.prisma.$queryRaw `SELECT 1`;
        isDbOnline = true;
        logger_js_1.logger.info('✅ Database connection established successfully.');
        return true;
    }
    catch (error) {
        isDbOnline = false;
        logger_js_1.logger.warn('⚠️ PostgreSQL database offline. System active in local resilient storage mode.');
        return false;
    }
}
//# sourceMappingURL=client.js.map