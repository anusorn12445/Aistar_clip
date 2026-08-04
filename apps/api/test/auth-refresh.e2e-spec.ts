import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { auth, createApp, createUserWithRoles, http } from './utils';

const EMAIL = 'refresh-user@aistar.test';
const PASSWORD = 'refresh-pass-2026';
const NEW_PASSWORD = 'refresh-pass-2026-new';

// F.1: refresh token rotation, logout revocation, change-password session cut
describe('Auth refresh tokens (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await createUserWithRoles(prisma, EMAIL, PASSWORD, ['researcher'], 'Refresh Probe');
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function login(password = PASSWORD) {
    const res = await http(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password })
      .expect(201);
    return res.body as { accessToken: string; refreshToken: string };
  }

  it('login returns accessToken + refreshToken pair', async () => {
    const body = await login();
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('POST /auth/refresh rotates the token — old one is 401 after use', async () => {
    const { refreshToken } = await login();

    const rotated = await http(app)
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(201);
    expect(rotated.body.accessToken).toEqual(expect.any(String));
    expect(rotated.body.refreshToken).toEqual(expect.any(String));
    expect(rotated.body.refreshToken).not.toBe(refreshToken);

    // consumed token is revoked
    await http(app).post('/api/auth/refresh').send({ refreshToken }).expect(401);

    // rotated token still works
    await http(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(201);
  });

  it('garbage refresh token → 401', async () => {
    await http(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'deadbeef'.repeat(8) })
      .expect(401);
  });

  it('POST /auth/logout revokes the refresh token', async () => {
    const { refreshToken } = await login();
    const res = await http(app).post('/api/auth/logout').send({ refreshToken }).expect(201);
    expect(res.body.ok).toBe(true);

    await http(app).post('/api/auth/refresh').send({ refreshToken }).expect(401);
  });

  it('change-password with wrong current password → 400', async () => {
    const { accessToken } = await login();
    await http(app)
      .post('/api/auth/change-password')
      .set(auth(accessToken))
      .send({ currentPassword: 'totally-wrong', newPassword: NEW_PASSWORD })
      .expect(400);
  });

  it('change-password succeeds and revokes existing refresh tokens', async () => {
    const { accessToken, refreshToken } = await login();

    await http(app)
      .post('/api/auth/change-password')
      .set(auth(accessToken))
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(201);

    // old refresh token is revoked
    await http(app).post('/api/auth/refresh').send({ refreshToken }).expect(401);

    // old password no longer works, new one does
    await http(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(401);
    await login(NEW_PASSWORD);
  });
});
