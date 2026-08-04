import { INestApplication } from '@nestjs/common';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  auth,
  createApp,
  http,
  loginAs,
} from './utils';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/auth/login — success returns accessToken + user', async () => {
    const res = await http(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      email: ADMIN_EMAIL,
      roles: expect.arrayContaining(['admin']),
    });
    expect(res.body.user.id).toEqual(expect.any(String));
  });

  it('POST /api/auth/login — wrong password → 401', async () => {
    await http(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'definitely-wrong-password' })
      .expect(401);
  });

  it('protected endpoint without token → 401', async () => {
    await http(app).get('/api/characters').expect(401);
  });

  it('GET /api/auth/me — คืน permissions map + viewScope ต่อ scoped module', async () => {
    const token = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await http(app).get('/api/auth/me').set(auth(token)).expect(200);

    // permissions: { module: [actions] } union ข้าม role — admin มี setting + content ครบ
    expect(res.body.permissions).toEqual(expect.any(Object));
    expect(res.body.permissions.setting).toEqual(expect.arrayContaining(['V', 'C']));
    expect(res.body.permissions.content).toEqual(expect.arrayContaining(['V']));

    // viewScope: มีคีย์ของ scoped module (content/episode) เป็นค่า all/team/own
    expect(res.body.viewScope).toEqual(expect.any(Object));
    expect(['all', 'team', 'own']).toContain(res.body.viewScope.content);
    expect(['all', 'team', 'own']).toContain(res.body.viewScope.episode);
  });
});
