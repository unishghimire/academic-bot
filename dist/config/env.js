import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(Number(process.env.PORT || process.env.SERVER_PORT || 3000)),
    // Database
    DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/academy?schema=public'),
    // Discord Credentials
    DISCORD_TOKEN: z.string().default('mock_token'),
    DISCORD_CLIENT_ID: z.string().default('1545687507725979768'),
    DISCORD_GUILD_ID: z.string().default('1545688175148535818'),
    // Roles for Server 1443245164200988724
    ROLE_ELITE: z.string().default(process.env.ROLE_ELITE || process.env.ROLE_PREMIUM || 'role_elite'),
    ROLE_PREMIUM: z.string().default('role_elite'),
    ROLE_TIER_1: z.string().default('role_tier_1_legacy'),
    ROLE_TIER_2: z.string().default('role_tier_2_legacy'),
    ROLE_TIER_3: z.string().default('role_tier_3_legacy'),
    ROLE_GRADUATE: z.string().default('role_graduate_legacy'),
    ROLE_INSTRUCTOR: z.string().default('1545689915440766976'),
    ROLE_ADMIN: z.string().default('1545689913628950558'),
    // Channels
    CHANNEL_WELCOME: z.string().optional(),
    CHANNEL_RULES: z.string().optional(),
    CHANNEL_ANNOUNCEMENTS: z.string().optional(),
    CHANNEL_LEADERBOARD: z.string().optional(),
    CHANNEL_SHOWCASE: z.string().optional(),
    CHANNEL_SUPPORT: z.string().optional(),
    CHANNEL_ERROR_LOGS: z.string().optional(),
    CHANNEL_AUDIT_LOGS: z.string().optional(),
    CHANNEL_ASSIGNMENT_REVIEWS: z.string().optional(),
    // Backend / Platform
    ACADEMY_API_SECRET: z.string().default('academy_api_secret_default_key_2026'),
    ACADEMY_WEBSITE_URL: z.string().default('https://academic-student-portal.vercel.app'),
    STUDENT_PORTAL_URL: z.string().default('https://academic-student-portal.vercel.app'),
    ADMIN_PANEL_KEY: z.string().default('academy_admin_panel_secret_key_32chars'),
    // Stripe (Optional - Admin QR Manual Payments used by default)
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    // Supabase Database & REST API
    SUPABASE_URL: z.string().default('https://snuunauwtuqyibmcajzh.supabase.co'),
    SUPABASE_ANON_KEY: z.string().default('sb_publishable_r_4B33JNzqJuZnmfYd_Yrg_rFVqoj_4'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    // Hosting / Keep-Alive URL
    RENDER_EXTERNAL_URL: z.string().optional(),
    APP_URL: z.string().optional(),
});
export const env = envSchema.parse(process.env);
//# sourceMappingURL=env.js.map