import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';

export const ADMIN_EMAIL = 'admin@aistar.local';
export const ADMIN_PASSWORD = 'aistar-admin-2026';

export const RESEARCHER_EMAIL = 'researcher@aistar.test';
export const RESEARCHER_PASSWORD = 'aistar-researcher-2026';

/** Bootstraps the Nest app exactly like main.ts (global prefix + pipes). */
export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

/** supertest handle bound to the app's HTTP server. */
export function http(app: INestApplication) {
  return request(app.getHttpServer());
}

/** POST /api/auth/login → accessToken. */
export async function loginAs(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  const res = await http(app)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(201);
  expect(res.body.accessToken).toEqual(expect.any(String));
  return res.body.accessToken;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Creates (idempotently) a user with only the seeded `researcher` role:
 * character V only — no C/E, no asset/prompt permissions (AC-4 negative cases).
 */
export async function ensureResearcher(prisma: PrismaClient): Promise<void> {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'researcher' } });
  const user = await prisma.user.upsert({
    where: { email: RESEARCHER_EMAIL },
    update: {},
    create: {
      email: RESEARCHER_EMAIL,
      passwordHash: await bcrypt.hash(RESEARCHER_PASSWORD, 10),
      name: 'E2E Researcher',
    },
  });
  await prisma.roleAssignment.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
}

/**
 * Creates (idempotently) a user with the given seeded roles.
 * Returns the user id. Used by Phase 2–4 suites to probe the permission matrix.
 */
export async function createUserWithRoles(
  prisma: PrismaClient,
  email: string,
  password: string,
  roleKeys: string[],
  name = email,
): Promise<string> {
  const roles = await prisma.role.findMany({ where: { key: { in: roleKeys } } });
  if (roles.length !== roleKeys.length) {
    throw new Error(`missing seeded roles: wanted ${roleKeys.join(',')}`);
  }
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      name,
    },
  });
  for (const role of roles) {
    await prisma.roleAssignment.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }
  return user.id;
}

/** Minimal valid 1x1 red PNG for upload tests. */
export const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** superagent parser that collects a binary response body into a Buffer. */
export function binaryParser(
  res: request.Response,
  callback: (err: Error | null, body: Buffer) => void,
): void {
  const stream = res as unknown as NodeJS.ReadableStream & {
    setEncoding(enc: string): void;
  };
  stream.setEncoding('binary');
  let data = '';
  stream.on('data', (chunk: string) => {
    data += chunk;
  });
  stream.on('end', () => callback(null, Buffer.from(data, 'binary')));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
