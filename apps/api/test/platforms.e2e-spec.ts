import { INestApplication } from '@nestjs/common';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  auth,
  createApp,
  http,
  loginAs,
} from './utils';

const SEEDED_PLATFORMS = ['chatgpt', 'gemini', 'grok', 'kling', 'midjourney', 'runway', 'sora', 'veo'];

// D4: open platform registry
describe('Platforms (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createApp();
    token = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /platforms lists the 8 seeded platforms', async () => {
    const res = await http(app).get('/api/platforms').set(auth(token)).expect(200);
    const keys = res.body.map((p: { key: string }) => p.key).sort();
    expect(keys).toEqual(SEEDED_PLATFORMS);
  });

  it('POST /platforms with duplicate key → 409', async () => {
    const res = await http(app)
      .post('/api/platforms')
      .set(auth(token))
      .send({ key: 'grok', name: 'Grok Again' })
      .expect(409);
    expect(res.body.message).toContain('grok');
  });
});
