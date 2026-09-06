"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupabaseClient = getSupabaseClient;
const supabase_js_1 = require("@supabase/supabase-js");
const env_js_1 = require("../config/env.js");
const logger_js_1 = require("../utils/logger.js");
let supabaseClient = null;
function getSupabaseClient() {
    if (supabaseClient) {
        return supabaseClient;
    }
    const url = env_js_1.env.SUPABASE_URL;
    const key = env_js_1.env.SUPABASE_SERVICE_ROLE_KEY || env_js_1.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
        logger_js_1.logger.warn('Supabase URL or Key not configured. Direct Supabase sync will be skipped.');
        return null;
    }
    try {
        supabaseClient = (0, supabase_js_1.createClient)(url, key, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        });
        return supabaseClient;
    }
    catch (err) {
        logger_js_1.logger.error({ err }, 'Failed to initialize Supabase client');
        return null;
    }
}
//# sourceMappingURL=supabase.js.map