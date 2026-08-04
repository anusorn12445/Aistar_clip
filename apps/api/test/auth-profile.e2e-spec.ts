import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { auth, createApp, createUserWithRoles, http, loginAs, PNG_BUFFER } from './utils';

const EMAIL = 'profile-user@aistar.test';
const PASSWORD = 'profile-pass-2026';
const NEW_PASSWORD = 'profile-pass-2026-new';

// User Profile — GET/PATCH /auth/me + avatar via assets (entityType 'user')
describe('Auth profile /auth/me (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let userId: string;
  let token: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    // character_designer has asset:C so the avatar-upload case can exercise POST /assets
    userId = await createUserWithRoles(prisma, EMAIL, PASSWORD, ['character_designer'], 'Profile Probe');
    app = await createApp();
    token = await loginAs(app, EMAIL, PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('GET /auth/me returns fresh profile shape with roles + null avatar', async () => {
    const res = await http(app).get('/api/auth/me').set(auth(token)).expect(200);
    expect(res.body.id).toBe(userId);
    expect(res.body.email).toBe(EMAIL);
    expect(res.body.name).toBe('Profile Probe');
    expect(res.body.status).toBe('active');
    expect(res.body.createdAt).toEqual(expect.any(String));
    expect(res.body.roles).toEqual(['character_designer']);
    expect(res.body.roleNames).toEqual(expect.arrayContaining([expect.any(String)]));
    expect(res.body.avatarAssetId).toBeNull();
  });

  it('GET /auth/me without token → 401', async () => {
    await http(app).get('/api/auth/me').expect(401);
  });

  it('PATCH /auth/me updates own name', async () => {
    const res = await http(app)
      .patch('/api/auth/me')
      .set(auth(token))
      .send({ name: 'Profile Renamed' })
      .expect(200);
    expect(res.body.name).toBe('Profile Renamed');

    // persisted
    const me = await http(app).get('/api/auth/me').set(auth(token)).expect(200);
    expect(me.body.name).toBe('Profile Renamed');
  });

  it('PATCH /auth/me with taken email → 409', async () => {
    const otherEmail = 'profile-other@aistar.test';
    await createUserWithRoles(prisma, otherEmail, PASSWORD, ['researcher'], 'Other');
    await http(app)
      .patch('/api/auth/me')
      .set(auth(token))
      .send({ email: otherEmail })
      .expect(409);
  });

  it('PATCH /auth/me with invalid email → 400', async () => {
    await http(app)
      .patch('/api/auth/me')
      .set(auth(token))
      .send({ email: 'not-an-email' })
      .expect(400);
  });

  it('avatar upload via POST /assets (entityType user) → /auth/me returns avatarAssetId', async () => {
    const upload = await http(app)
      .post('/api/assets')
      .set(auth(token))
      .field('assetType', 'avatar')
      .field('entityType', 'user')
      .field('entityId', userId)
      .field('linkRole', 'primary_reference')
      .attach('file', PNG_BUFFER, 'avatar.png')
      .expect(201);

    const me = await http(app).get('/api/auth/me').set(auth(token)).expect(200);
    expect(me.body.avatarAssetId).toBe(upload.body.id);
  });

  it('change-password still works: wrong current → 400, correct → 201 then login with new password', async () => {
    await http(app)
      .post('/api/auth/change-password')
      .set(auth(token))
      .send({ currentPassword: 'totally-wrong', newPassword: NEW_PASSWORD })
      .expect(400);

    await http(app)
      .post('/api/auth/change-password')
      .set(auth(token))
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(201);

    // old password rejected, new one works
    await http(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(401);
    await loginAs(app, EMAIL, NEW_PASSWORD);
  });
});
