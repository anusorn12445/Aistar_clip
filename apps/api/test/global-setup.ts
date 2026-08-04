// Jest globalSetup — runs once before the whole e2e suite.
// Prepares a deterministic aistar_test database: migrate deploy, truncate
// everything, re-seed (14 roles + permission matrix, 6 platforms, admin user).
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import { applyTestEnv, TEST_DATABASE_URL, TEST_STORAGE_DIR } from './test-env';

export default async function globalSetup(): Promise<void> {
  applyTestEnv();

  const apiRoot = path.resolve(__dirname, '..');
  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };

  // Fresh isolated storage dir for uploads + export zips.
  rmSync(TEST_STORAGE_DIR, { recursive: true, force: true });
  mkdirSync(TEST_STORAGE_DIR, { recursive: true });

  execSync('npx prisma migrate deploy', { cwd: apiRoot, env, stdio: 'inherit' });

  // Truncate all app tables so repeated runs stay deterministic.
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  try {
    const tables: Array<{ tablename: string }> = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    if (tables.length > 0) {
      const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await prisma.$disconnect();
  }

  execSync('npx ts-node prisma/seed.ts', { cwd: apiRoot, env, stdio: 'inherit' });
}
