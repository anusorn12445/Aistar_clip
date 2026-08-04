import * as path from 'node:path';

// Test database — must NEVER point at the dev DB (aistar).
export const TEST_DATABASE_URL =
  'postgresql://thuspawat@localhost:5432/aistar_test';

// Isolated storage dir so uploads/exports never touch apps/api/storage.
export const TEST_STORAGE_DIR = path.join(__dirname, '.storage-test');

/**
 * Applies the test environment to process.env.
 * Must run BEFORE any app/Prisma import: PrismaClient reads DATABASE_URL at
 * instantiation, StorageService reads STORAGE_DIR at construction, and
 * @nestjs/config gives pre-existing process.env values precedence over .env.
 */
export function applyTestEnv(): void {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.STORAGE_DIR = TEST_STORAGE_DIR;
  // Graceful-degradation path: AI must report configured=false in tests.
  process.env.ANTHROPIC_API_KEY = '';
}
