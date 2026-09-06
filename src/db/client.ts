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

let isDbOnline = false;

export function isDatabaseOnline(): boolean {
  return isDbOnline;
}

export async function checkDbConnection(): Promise<boolean> {
  // 1. Verify Supabase cloud connection
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { error } = await supabase.from('payment_verifications').select('id').limit(1);
      if (!error) {
        isDbOnline = true;
        logger.info('✅ Supabase cloud database connected successfully.');
        return true;
      }
    } catch {
      // Continue to verify PostgreSQL if configured
    }
  }

  // 2. If DATABASE_URL is defaulted to localhost and no local postgres is active, use Supabase/local mode
  if (!env.DATABASE_URL || env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('mock')) {
    isDbOnline = false;
    logger.info('ℹ️ Operating via Supabase cloud API & resilient storage.');
    return false;
  }

  // 3. Direct PostgreSQL connection if custom remote DATABASE_URL provided
  try {
    await prisma.$queryRaw`SELECT 1`;
    isDbOnline = true;
    logger.info('✅ Direct PostgreSQL database connection established successfully.');
    return true;
  } catch (error) {
    isDbOnline = false;
    logger.warn('⚠️ Direct PostgreSQL connection failed. Operating in Supabase cloud mode.');
    return false;
  }
}
