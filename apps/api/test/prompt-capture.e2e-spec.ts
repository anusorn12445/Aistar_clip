import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AiClaudeService } from '../src/ai/ai-claude.service';
import type { ClaudeCallResult } from '../src/ai/ai-claude.service';
import { PromptCaptureService } from '../src/prompts/prompt-capture.service';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  PNG_BUFFER,
  RESEARCHER_EMAIL,
  RESEARCHER_PASSWORD,
  auth,
  createApp,
  ensureResearcher,
  http,
  loginAs,
} from './utils';

// Prompt Quick-Capture (เพิ่มเร็ว — วางจาก Facebook).
// e2e MUST NOT call live AI (ANTHROPIC_API_KEY blanked in test-env → real path 503s;
// happy paths stub AiClaudeService.callClaude) and MUST NOT hit the real internet
// (fetch-url happy/sad paths stub PromptCaptureService.httpGet + lookupHost;
// SSRF-reject paths never reach the network by construction).
describe('Prompt quick-capture (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string; // researcher role: ไม่มี prompt C → 403

  const CANNED_EXTRACTION = {
    name: 'Cinematic Bangkok street portrait',
    promptType: 'scene',
    body: 'cinematic portrait of a thai woman, bangkok neon street at night, 85mm, shallow depth of field',
    negativeBody: 'blurry, extra fingers',
    targetPlatform: 'midjourney',
    notes: '--ar 9:16 --v 6',
    confidence: 'high',
  };

  function stubCallClaude(parsed: Record<string, unknown> = CANNED_EXTRACTION): jest.SpyInstance {
    const svc = app.get(AiClaudeService);
    return jest.spyOn(svc, 'callClaude').mockImplementation(
      async () =>
        ({
          parsed,
          model: 'stub-model',
          usage: { inputTokens: 10, outputTokens: 20 },
          latencyMs: 1,
        }) as ClaudeCallResult<unknown>,
    );
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await ensureResearcher(prisma);
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ── extract ─────────────────────────────────────────────────

  it('extract without text or image → 400', async () => {
    await http(app)
      .post('/api/prompts/capture/extract')
      .set(auth(adminToken))
      .send({ sourceUrl: 'https://facebook.com/groups/x/posts/1' })
      .expect(400);
  });

  it('extract with text (stubbed AI) returns structured fields', async () => {
    const spy = stubCallClaude();
    const res = await http(app)
      .post('/api/prompts/capture/extract')
      .set(auth(adminToken))
      .send({ text: 'Prompt: cinematic portrait ... cr. someone 🙏 กดไลก์กดแชร์ด้วยนะ' })
      .expect(201);
    expect(res.body.name).toBe(CANNED_EXTRACTION.name);
    expect(res.body.promptType).toBe('scene');
    expect(res.body.body).toContain('cinematic portrait');
    expect(res.body.negativeBody).toBe(CANNED_EXTRACTION.negativeBody);
    expect(res.body.targetPlatform).toBe('midjourney');
    expect(res.body.confidence).toBe('high');
    expect(res.body.model).toBe('stub-model');
    // ไม่ persist — extract เป็นขั้นรีวิว
    const count = await prisma.prompt.count({ where: { name: CANNED_EXTRACTION.name } });
    expect(count).toBe(0);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('extract with imageBase64 sends a multimodal message (image + text blocks)', async () => {
    const spy = stubCallClaude();
    await http(app)
      .post('/api/prompts/capture/extract')
      .set(auth(adminToken))
      .send({
        text: 'สวยมาก',
        imageBase64: { mediaType: 'image/png', data: PNG_BUFFER.toString('base64') },
      })
      .expect(201);
    const args = spy.mock.calls[0][0] as { content: { type: string }[] };
    expect(Array.isArray(args.content)).toBe(true);
    expect(args.content.map((b) => b.type)).toEqual(['image', 'text']);
  });

  it('extract coerces an out-of-enum promptType → scene + confidence low', async () => {
    stubCallClaude({ ...CANNED_EXTRACTION, promptType: 'landscape_photo', confidence: 'high' });
    const res = await http(app)
      .post('/api/prompts/capture/extract')
      .set(auth(adminToken))
      .send({ text: 'some post' })
      .expect(201);
    expect(res.body.promptType).toBe('scene');
    expect(res.body.confidence).toBe('low');
  });

  it('extract rejects an unsupported imageBase64 mediaType (400)', async () => {
    await http(app)
      .post('/api/prompts/capture/extract')
      .set(auth(adminToken))
      .send({
        text: 'x',
        imageBase64: { mediaType: 'image/bmp', data: PNG_BUFFER.toString('base64') },
      })
      .expect(400);
  });

  it('extract 503s gracefully when AI unconfigured (no stub)', async () => {
    await http(app)
      .post('/api/prompts/capture/extract')
      .set(auth(adminToken))
      .send({ text: 'prompt: something' })
      .expect(503);
  });

  it('capture status probe reports configured=false in tests', async () => {
    const res = await http(app)
      .get('/api/prompts/capture/status')
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.configured).toBe(false);
  });

  // ── fetch-url: SSRF guard (path เหล่านี้ไม่แตะ network เลย) ──

  it('fetch-url rejects http://, localhost, *.local and private IPs (400)', async () => {
    const cases = [
      'http://example.com/post/1', // http-only
      'https://localhost/post/1',
      'https://foo.local/post/1',
      'https://127.0.0.1/post/1',
      'https://10.1.2.3/post/1',
      'https://172.20.0.1/post/1',
      'https://192.168.1.10/post/1',
      'https://169.254.169.254/latest/meta-data', // cloud metadata
      'not a url at all',
    ];
    for (const url of cases) {
      await http(app)
        .post('/api/prompts/capture/fetch-url')
        .set(auth(adminToken))
        .send({ url })
        .expect(400);
    }
  });

  it('fetch-url rejects a hostname that resolves to a private IP (400, stubbed DNS)', async () => {
    const svc = app.get(PromptCaptureService);
    jest.spyOn(svc, 'lookupHost').mockResolvedValue(['192.168.1.5']);
    const httpSpy = jest.spyOn(svc, 'httpGet');
    await http(app)
      .post('/api/prompts/capture/fetch-url')
      .set(auth(adminToken))
      .send({ url: 'https://internal-alias.example.com/post/1' })
      .expect(400);
    expect(httpSpy).not.toHaveBeenCalled();
  });

  it('fetch-url returns ok:false + Thai reason when the page is unfetchable (stubbed fetch)', async () => {
    const svc = app.get(PromptCaptureService);
    jest.spyOn(svc, 'lookupHost').mockResolvedValue(['93.184.216.34']);
    jest.spyOn(svc, 'httpGet').mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await http(app)
      .post('/api/prompts/capture/fetch-url')
      .set(auth(adminToken))
      .send({ url: 'https://www.facebook.com/groups/secret/posts/1' })
      .expect(201);
    expect(res.body.ok).toBe(false);
    expect(res.body.reason).toContain('login');
  });

  it('fetch-url parses OG tags + downloads og:image into an asset (stubbed fetch)', async () => {
    const svc = app.get(PromptCaptureService);
    jest.spyOn(svc, 'lookupHost').mockResolvedValue(['93.184.216.34']);
    const html = `<html><head>
      <title>fallback title</title>
      <meta property="og:title" content="Midjourney prompt แจกฟรี" />
      <meta property="og:description" content="prompt: neon city --ar 9:16" />
      <meta property="og:image" content="https://cdn.example.com/pic.png" />
    </head><body></body></html>`;
    jest.spyOn(svc, 'httpGet').mockImplementation(async (url: string) => {
      if (url.includes('cdn.example.com')) {
        return new Response(new Uint8Array(PNG_BUFFER), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      return new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    });

    const res = await http(app)
      .post('/api/prompts/capture/fetch-url')
      .set(auth(adminToken))
      .send({ url: 'https://public-blog.example.com/prompt-post' })
      .expect(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.title).toBe('Midjourney prompt แจกฟรี');
    expect(res.body.description).toContain('neon city');
    expect(res.body.imageAssetId).toEqual(expect.any(String));

    const asset = await prisma.asset.findUnique({ where: { id: res.body.imageAssetId } });
    expect(asset).not.toBeNull();
    expect(asset!.mimeType).toBe('image/png');
    expect(asset!.assetType).toBe('prompt_example');
  });

  // ── capture (persist) ───────────────────────────────────────

  it('capture persists Prompt + v1 with sourceUrl and links the example asset', async () => {
    // อัปโหลดรูปตัวอย่างก่อน (เหมือน client วางรูปจาก clipboard)
    const upload = await http(app)
      .post('/api/assets')
      .set(auth(adminToken))
      .field('assetType', 'prompt_example')
      .attach('file', PNG_BUFFER, 'pasted.png')
      .expect(201);
    const assetId = upload.body.id;

    const sourceUrl = 'https://www.facebook.com/groups/aiprompts/posts/12345';
    const res = await http(app)
      .post('/api/prompts/capture')
      .set(auth(adminToken))
      .send({
        name: 'E2E quick-capture neon city',
        promptType: 'scene',
        body: 'neon city street, rain reflections, cinematic lighting',
        negativeBody: 'lowres',
        targetPlatform: 'midjourney',
        notes: '--ar 9:16 --v 6',
        sourceUrl,
        exampleAssetIds: [assetId],
      })
      .expect(201);

    expect(res.body.status).toBe('draft');
    const version = res.body.versions[0];
    expect(version.versionLabel).toBe('v1');
    expect(version.sourceUrl).toBe(sourceUrl);
    expect(version.targetPlatform).toBe('midjourney');
    expect(version.performanceNote).toBe('--ar 9:16 --v 6');

    // asset ผูกทั้งสายตรง (promptVersionId) และ polymorphic link (gallery/thumbnail)
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: { links: true },
    });
    expect(asset!.promptVersionId).toBe(version.id);
    expect(
      asset!.links.some((l) => l.entityType === 'prompt' && l.entityId === res.body.id),
    ).toBe(true);

    // list เดิมยังทำงาน + เห็นรูปตัวอย่างของ prompt ใหม่
    const list = await http(app)
      .get('/api/prompts')
      .query({ q: 'E2E quick-capture neon city' })
      .set(auth(adminToken))
      .expect(200);
    const item = list.body.items.find((p: { id: string }) => p.id === res.body.id);
    expect(item).toBeDefined();
    expect(item.exampleThumbAssetId).toBe(assetId);
    expect(item.latestVersion.sourceUrl).toBe(sourceUrl);
  });

  it('capture with defaults: targetPlatform falls back to unknown', async () => {
    const res = await http(app)
      .post('/api/prompts/capture')
      .set(auth(adminToken))
      .send({
        name: 'E2E quick-capture minimal',
        promptType: 'shot',
        body: 'low angle hero shot',
      })
      .expect(201);
    expect(res.body.versions[0].targetPlatform).toBe('unknown');
    expect(res.body.versions[0].sourceUrl).toBeNull();
  });

  it('capture rejects a bad promptType (400)', async () => {
    await http(app)
      .post('/api/prompts/capture')
      .set(auth(adminToken))
      .send({ name: 'x', promptType: 'meme', body: 'something' })
      .expect(400);
  });

  it('capture rejects an empty/whitespace body (400)', async () => {
    await http(app)
      .post('/api/prompts/capture')
      .set(auth(adminToken))
      .send({ name: 'x', promptType: 'scene', body: '' })
      .expect(400);
    await http(app)
      .post('/api/prompts/capture')
      .set(auth(adminToken))
      .send({ name: 'x', promptType: 'scene', body: '   ' })
      .expect(400);
  });

  it('capture rejects unknown exampleAssetIds (400)', async () => {
    await http(app)
      .post('/api/prompts/capture')
      .set(auth(adminToken))
      .send({
        name: 'x',
        promptType: 'scene',
        body: 'something',
        exampleAssetIds: ['00000000-0000-4000-8000-000000000000'],
      })
      .expect(400);
  });

  it('role without prompt C gets 403 on all capture endpoints', async () => {
    await http(app)
      .post('/api/prompts/capture/extract')
      .set(auth(researcherToken))
      .send({ text: 'x' })
      .expect(403);
    await http(app)
      .post('/api/prompts/capture/fetch-url')
      .set(auth(researcherToken))
      .send({ url: 'https://example.com' })
      .expect(403);
    await http(app)
      .post('/api/prompts/capture')
      .set(auth(researcherToken))
      .send({ name: 'x', promptType: 'scene', body: 'y' })
      .expect(403);
  });
});
