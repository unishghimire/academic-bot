"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.isDatabaseOnline = isDatabaseOnline;
exports.isPostgresOnline = isPostgresOnline;
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
let isSupabaseReady = false;
let isPostgresReady = false;
function isDatabaseOnline() {
    return isSupabaseReady || isPostgresReady;
}
function isPostgresOnline() {
    return isPostgresReady;
}
async function checkDbConnection() {
    // 1. Verify Supabase cloud connection
    const supabase = (0, supabase_js_1.getSupabaseClient)();
    if (supabase) {
        try {
            const { error } = await supabase.from('payment_verifications').select('id').limit(1);
            if (!error) {
                isSupabaseReady = true;
                logger_js_1.logger.info('✅ Supabase cloud database connected successfully.');
            }
            else {
                isSupabaseReady = false;
                logger_js_1.logger.warn({ error: error.message }, 'Supabase cloud ping returned an error');
            }
        }
        catch {
            isSupabaseReady = false;
        }
    }
    // 2. Direct PostgreSQL connection only if remote non-localhost DATABASE_URL is configured
    if (env_js_1.env.DATABASE_URL && !env_js_1.env.DATABASE_URL.includes('localhost') && !env_js_1.env.DATABASE_URL.includes('mock')) {
        try {
            await exports.prisma.$queryRaw `SELECT 1`;
            isPostgresReady = true;
            logger_js_1.logger.info('✅ Direct PostgreSQL database connection established successfully.');
        }
        catch (error) {
            isPostgresReady = false;
            logger_js_1.logger.warn('⚠️ Direct PostgreSQL connection failed. Operating in Supabase cloud mode.');
        }
    }
    else {
        isPostgresReady = false;
        logger_js_1.logger.info('ℹ️ Active Database: Supabase Cloud. Localhost PostgreSQL is bypassed.');
    }
    return isSupabaseReady || isPostgresReady;
}
//# sourceMappingURL=client.js.map