import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  RESEARCHER_EMAIL,
  RESEARCHER_PASSWORD,
  auth,
  createApp,
  ensureResearcher,
  http,
  loginAs,
} from './utils';

const NEW_EMAIL = 'users-e2e-new@aistar.test';
const NEW_PASSWORD = 'users-e2e-pass-2026';

// User management (§B users) + /roles select source
describe('Users admin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string;
  let createdId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('admin creates a user with roles → login works with those roles', async () => {
    const res = await http(app)
      .post('/api/users')
      .set(auth(adminToken))
      .send({
        email: NEW_EMAIL,
        name: 'Users E2E Probe',
        password: NEW_PASSWORD,
        roleKeys: ['researcher', 'script_writer'],
      })
      .expect(201);

    createdId = res.body.id;
    expect(res.body.email).toBe(NEW_EMAIL);
    expect(res.body.roles.map((r: { key: string }) => r.key).sort()).toEqual([
      'researcher',
      'script_writer',
    ]);

    const login = await http(app)
      .post('/api/auth/login')
      .send({ email: NEW_EMAIL, password: NEW_PASSWORD })
      .expect(201);
    expect(login.body.user.roles.sort()).toEqual(['researcher', 'script_writer']);
  });

  it('duplicate email → 409', async () => {
    await http(app)
      .post('/api/users')
      .set(auth(adminToken))
      .send({
        email: NEW_EMAIL,
        name: 'dupe',
        password: NEW_PASSWORD,
        roleKeys: ['researcher'],
      })
      .expect(409);
  });

  it('unknown role key → 400', async () => {
    await http(app)
      .post('/api/users')
      .set(auth(adminToken))
      .send({
        email: 'users-e2e-badrole@aistar.test',
        name: 'bad role',
        password: NEW_PASSWORD,
        roleKeys: ['does_not_exist'],
      })
      .expect(400);
  });

  it('PATCH replaces roles', async () => {
    const res = await http(app)
      .patch(`/api/users/${createdId}`)
      .set(auth(adminToken))
      .send({ roleKeys: ['publisher'] })
      .expect(200);
    expect(res.body.roles.map((r: { key: string }) => r.key)).toEqual(['publisher']);
  });

  it('PATCH status suspended → user can no longer log in', async () => {
    await http(app)
      .patch(`/api/users/${createdId}`)
      .set(auth(adminToken))
      .send({ status: 'suspended' })
      .expect(200);

    await http(app)
      .post('/api/auth/login')
      .send({ email: NEW_EMAIL, password: NEW_PASSWORD })
      .expect(401);
  });

  it('admin cannot suspend their own account → 400', async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    await http(app)
      .patch(`/api/users/${admin.id}`)
      .set(auth(adminToken))
      .send({ status: 'suspended' })
      .expect(400);
  });

  it('GET /users supports q / role / status filters', async () => {
    const byQ = await http(app)
      .get('/api/users')
      .query({ q: 'users-e2e-new' })
      .set(auth(adminToken))
      .expect(200);
    expect(byQ.body.items).toHaveLength(1);
    expect(byQ.body.items[0].email).toBe(NEW_EMAIL);

    const byRole = await http(app)
      .get('/api/users')
      .query({ role: 'publisher', status: 'suspended' })
      .set(auth(adminToken))
      .expect(200);
    expect(
      byRole.body.items.some((u: { email: string }) => u.email === NEW_EMAIL),
    ).toBe(true);
  });

  it('researcher is denied POST /users (403) and GET /users (no user V)', async () => {
    await http(app)
      .post('/api/users')
      .set(auth(researcherToken))
      .send({
        email: 'users-e2e-sneak@aistar.test',
        name: 'sneak',
        password: NEW_PASSWORD,
        roleKeys: ['researcher'],
      })
      .expect(403);

    await http(app).get('/api/users').set(auth(researcherToken)).expect(403);
  });

  it('GET /roles returns the seeded role list', async () => {
    const res = await http(app).get('/api/roles').set(auth(adminToken)).expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(14);
    const keys = res.body.map((r: { key: string }) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['admin', 'researcher', 'publisher', 'commerce_lead']));
    expect(res.body[0]).toHaveProperty('name');
  });
});
