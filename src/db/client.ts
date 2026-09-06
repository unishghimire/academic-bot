import { PrismaClient } from '@prisma/client';
import { getSupabaseClient } from './supabase.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

let isSupabaseReady = false;
let isPostgresReady = false;

export function isDatabaseOnline(): boolean {
  return isSupabaseReady || isPostgresReady;
}

export function isPostgresOnline(): boolean {
  return isPostgresReady;
}

export async function checkDbConnection(): Promise<boolean> {
  // 1. Verify Supabase cloud connection
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { error } = await supabase.from('payment_verifications').select('id').limit(1);
      if (!error) {
        isSupabaseReady = true;
        logger.info('✅ Supabase cloud database connected successfully.');
      } else {
        isSupabaseReady = false;
        logger.warn({ error: error.message }, 'Supabase cloud ping returned an error');
      }
    } catch {
      isSupabaseReady = false;
    }
  }

  // 2. Direct PostgreSQL connection only if remote non-localhost DATABASE_URL is configured
  if (env.DATABASE_URL && !env.DATABASE_URL.includes('localhost') && !env.DATABASE_URL.includes('mock')) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      isPostgresReady = true;
      logger.info('✅ Direct PostgreSQL database connection established successfully.');
    } catch (error) {
      isPostgresReady = false;
      logger.warn('⚠️ Direct PostgreSQL connection failed. Operating in Supabase cloud mode.');
    }
  } else {
    isPostgresReady = false;
    logger.info('ℹ️ Active Database: Supabase Cloud. Localhost PostgreSQL is bypassed.');
  }

  return isSupabaseReady || isPostgresReady;
}
