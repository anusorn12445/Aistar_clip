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

// unique tokens so cross-suite data never collides
const TOKEN = 'Zeta9Search';
const PROMPT_TOKEN = 'Yq7PromptOnly';

// Global search — permission-scoped groups (§B search)
describe('Search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string;
  let characterId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);

    const character = await http(app)
      .post('/api/characters')
      .set(auth(adminToken))
      .send({ nameTh: `ตัวค้นหา ${TOKEN}`, nameEn: `${TOKEN} Girl` })
      .expect(201);
    characterId = character.body.id;

    await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({ name: `${TOKEN} Serum`, category: 'beauty' })
      .expect(201);

    await http(app)
      .post('/api/campaigns')
      .set(auth(adminToken))
      .send({ name: `${TOKEN} Launch` })
      .expect(201);

    await http(app)
      .post('/api/prompts')
      .set(auth(adminToken))
      .send({
        name: `${PROMPT_TOKEN} identity`,
        promptType: 'identity',
        body: `secret prompt body ${PROMPT_TOKEN}`,
        targetPlatform: 'kling',
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('admin search finds character/product/campaign grouped with hrefs', async () => {
    const res = await http(app)
      .get('/api/search')
      .query({ q: TOKEN })
      .set(auth(adminToken))
      .expect(200);

    const byType = new Map<string, { href: string; title: string }[]>();
    for (const item of res.body) {
      byType.set(item.type, [...(byType.get(item.type) ?? []), item]);
    }
    expect([...byType.keys()]).toEqual(
      expect.arrayContaining(['characters', 'products', 'campaigns']),
    );
    expect(byType.get('characters')![0].href).toBe(`/characters/${characterId}`);
    expect(byType.get('products')![0].href).toBe('/products');
    expect(byType.get('campaigns')![0].href).toBe('/campaigns');
  });

  it('types param restricts groups', async () => {
    const res = await http(app)
      .get('/api/search')
      .query({ q: TOKEN, types: 'characters' })
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.every((r: { type: string }) => r.type === 'characters')).toBe(true);
  });

  it('empty query → empty result', async () => {
    const res = await http(app)
      .get('/api/search')
      .query({ q: '   ' })
      .set(auth(adminToken))
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('admin finds prompts, researcher (no prompt V) gets no prompts group', async () => {
    const adminRes = await http(app)
      .get('/api/search')
      .query({ q: PROMPT_TOKEN })
      .set(auth(adminToken))
      .expect(200);
    expect(adminRes.body.some((r: { type: string }) => r.type === 'prompts')).toBe(true);

    const resRes = await http(app)
      .get('/api/search')
      .query({ q: PROMPT_TOKEN })
      .set(auth(researcherToken))
      .expect(200);
    expect(resRes.body.some((r: { type: string }) => r.type === 'prompts')).toBe(false);
    // the prompt-only term matches nothing the researcher may view
    expect(resRes.body).toEqual([]);
  });

  it('researcher still finds modules they can view (character/product/campaign)', async () => {
    const res = await http(app)
      .get('/api/search')
      .query({ q: TOKEN })
      .set(auth(researcherToken))
      .expect(200);
    const types = new Set(res.body.map((r: { type: string }) => r.type));
    expect([...types]).toEqual(
      expect.arrayContaining(['characters', 'products', 'campaigns']),
    );
    // researcher has no asset/prompt/episode/location V
    expect(types.has('prompts')).toBe(false);
    expect(types.has('assets')).toBe(false);
  });
});
