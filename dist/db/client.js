"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.isDatabaseOnline = isDatabaseOnline;
exports.checkDbConnection = checkDbConnection;
const client_1 = require("@prisma/client");
const supabase_js_1 = require("./supabase.js");
const env_js_1 = require("../config/env.js");
const logger_js_1 = require("../utils/logger.js");
exports.prisma = global.prisma ||
    new client_1.PrismaClient({
        log: process.env.NODE_ENV === 'development'
            ? ['error', 'warn']
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
    // 1. Verify Supabase cloud connection
    const supabase = (0, supabase_js_1.getSupabaseClient)();
    if (supabase) {
        try {
            const { error } = await supabase.from('payment_verifications').select('id').limit(1);
            if (!error) {
                isDbOnline = true;
                logger_js_1.logger.info('✅ Supabase cloud database connected successfully.');
                return true;
            }
        }
        catch {
            // Continue to verify PostgreSQL if configured
        }
    }
    // 2. If DATABASE_URL is defaulted to localhost and no local postgres is active, use Supabase/local mode
    if (!env_js_1.env.DATABASE_URL || env_js_1.env.DATABASE_URL.includes('localhost') || env_js_1.env.DATABASE_URL.includes('mock')) {
        isDbOnline = false;
        logger_js_1.logger.info('ℹ️ Operating via Supabase cloud API & resilient storage.');
        return false;
    }
    // 3. Direct PostgreSQL connection if custom remote DATABASE_URL provided
    try {
        await exports.prisma.$queryRaw `SELECT 1`;
        isDbOnline = true;
        logger_js_1.logger.info('✅ Direct PostgreSQL database connection established successfully.');
        return true;
    }
    catch (error) {
        isDbOnline = false;
        logger_js_1.logger.warn('⚠️ Direct PostgreSQL connection failed. Operating in Supabase cloud mode.');
        return false;
    }
}
//# sourceMappingURL=client.js.map