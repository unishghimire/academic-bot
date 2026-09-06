"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    PORT: zod_1.z.coerce.number().default(3000),
    // Database
    DATABASE_URL: zod_1.z.string().default('postgresql://postgres:postgres@localhost:5432/academy?schema=public'),
    // Discord Credentials
    DISCORD_TOKEN: zod_1.z.string().default('mock_token'),
    DISCORD_CLIENT_ID: zod_1.z.string().default('mock_client_id'),
    DISCORD_GUILD_ID: zod_1.z.string().default('mock_guild_id'),
    // Roles
    ROLE_PREMIUM: zod_1.z.string().default('100000000000000001'),
    ROLE_TIER_1: zod_1.z.string().default('100000000000000002'),
    ROLE_TIER_2: zod_1.z.string().default('100000000000000003'),
    ROLE_TIER_3: zod_1.z.string().default('100000000000000004'),
    ROLE_GRADUATE: zod_1.z.string().default('100000000000000005'),
    ROLE_INSTRUCTOR: zod_1.z.string().default('100000000000000006'),
    ROLE_ADMIN: zod_1.z.string().default('100000000000000007'),
    // Channels
    CHANNEL_WELCOME: zod_1.z.string().optional(),
    CHANNEL_RULES: zod_1.z.string().optional(),
    CHANNEL_ANNOUNCEMENTS: zod_1.z.string().optional(),
    CHANNEL_LEADERBOARD: zod_1.z.string().optional(),
    CHANNEL_SHOWCASE: zod_1.z.string().optional(),
    CHANNEL_SUPPORT: zod_1.z.string().optional(),
    CHANNEL_ERROR_LOGS: zod_1.z.string().optional(),
    CHANNEL_AUDIT_LOGS: zod_1.z.string().optional(),
    CHANNEL_ASSIGNMENT_REVIEWS: zod_1.z.string().optional(),
    // Backend / Platform
    ACADEMY_API_SECRET: zod_1.z.string().default('academy_api_secret_default_key_2026'),
    ACADEMY_WEBSITE_URL: zod_1.z.string().default('https://academy.example.com'),
    ADMIN_PANEL_KEY: zod_1.z.string().default('academy_admin_panel_secret_key_32chars'),
    // Stripe (Optional - Admin QR Manual Payments used by default)
    STRIPE_SECRET_KEY: zod_1.z.string().optional(),
    STRIPE_WEBHOOK_SECRET: zod_1.z.string().optional(),
    // Supabase Database & REST API
    SUPABASE_URL: zod_1.z.string().default('https://snuunauwtuqyibmcajzh.supabase.co'),
    SUPABASE_ANON_KEY: zod_1.z.string().default('sb_publishable_r_4B33JNzqJuZnmfYd_Yrg_rFVqoj_4'),
    SUPABASE_SERVICE_ROLE_KEY: zod_1.z.string().optional(),
    // Hosting / Keep-Alive URL
    RENDER_EXTERNAL_URL: zod_1.z.string().optional(),
    APP_URL: zod_1.z.string().optional(),
});
exports.env = envSchema.parse(process.env);
//# sourceMappingURL=env.js.map