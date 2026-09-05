import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform(val => parseInt(val, 10)).default('3000'),

  // Database
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/academy?schema=public'),

  // Discord Credentials
  DISCORD_TOKEN: z.string().default('mock_token'),
  DISCORD_CLIENT_ID: z.string().default('mock_client_id'),
  DISCORD_GUILD_ID: z.string().default('mock_guild_id'),

  // Roles
  ROLE_PREMIUM: z.string().default('100000000000000001'),
  ROLE_TIER_1: z.string().default('100000000000000002'),
  ROLE_TIER_2: z.string().default('100000000000000003'),
  ROLE_TIER_3: z.string().default('100000000000000004'),
  ROLE_GRADUATE: z.string().default('100000000000000005'),
  ROLE_INSTRUCTOR: z.string().default('100000000000000006'),
  ROLE_ADMIN: z.string().default('100000000000000007'),

  // Channels
  CHANNEL_WELCOME: z.string().optional(),
  CHANNEL_RULES: z.string().optional(),
  CHANNEL_ANNOUNCEMENTS: z.string().optional(),
  CHANNEL_LEADERBOARD: z.string().optional(),
  CHANNEL_SHOWCASE: z.string().optional(),
  CHANNEL_SUPPORT: z.string().optional(),
  CHANNEL_ERROR_LOGS: z.string().optional(),
  CHANNEL_AUDIT_LOGS: z.string().optional(),

  // Backend / Platform
  ACADEMY_API_SECRET: z.string({ required_error: 'ACADEMY_API_SECRET must be set (shared secret for course website API calls)' }),
  ACADEMY_WEBSITE_URL: z.string().default('https://academy.example.com'),
  ADMIN_PANEL_KEY: z.string({ required_error: 'ADMIN_PANEL_KEY must be set (strong random admin panel access key)' }).min(16, 'ADMIN_PANEL_KEY must be at least 16 characters'),

  // Stripe (Optional - Admin QR Manual Payments used by default)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // AI Assistant
  AI_DAILY_CAP_PER_USER: z.string().transform(val => parseInt(val, 10)).default('20'),
  AI_MONTHLY_BUDGET_KILL_SWITCH: z.string().transform(val => parseInt(val, 10)).default('500'),
  OPENAI_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
