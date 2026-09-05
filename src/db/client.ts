import { PrismaClient } from '@prisma/client';
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
        ? ['query', 'error', 'warn']
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
  try {
    await prisma.$queryRaw`SELECT 1`;
    isDbOnline = true;
    logger.info('✅ Database connection established successfully.');
    return true;
  } catch (error) {
    isDbOnline = false;
    logger.warn('⚠️ PostgreSQL database offline. System active in local resilient storage mode.');
    return false;
  }
}
