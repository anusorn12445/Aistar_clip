import { INestApplication } from '@nestjs/common';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  auth,
  createApp,
  http,
  loginAs,
} from './utils';

// Graceful degradation: no ANTHROPIC_API_KEY → status configured:false,
// draft endpoint 503 (manual entry stays possible)
describe('AI graceful degradation (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createApp();
    token = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /ai/status → { configured: false }', async () => {
    const res = await http(app).get('/api/ai/status').set(auth(token)).expect(200);
    expect(res.body.configured).toBe(false);
  });

  it('POST /ai/characters/draft → 503 with setup guidance', async () => {
    const res = await http(app)
      .post('/api/ai/characters/draft')
      .set(auth(token))
      .send({ nameTh: 'น้ำหวาน', oneLineConcept: 'ไอดอลสายเกมที่รีวิวเกดเจ็ต' })
      .expect(503);
    expect(res.body.message).toContain('ANTHROPIC_API_KEY');
  });
});
