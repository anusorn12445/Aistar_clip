import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AiClaudeService } from '../src/ai/ai-claude.service';
import type { ClaudeCallResult } from '../src/ai/ai-claude.service';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  PNG_BUFFER,
  auth,
  createApp,
  createUserWithRoles,
  http,
  loginAs,
} from './utils';

// งานภาพ (Image Request) — brief → assign → produce → upload versions → review → approve
// - displayCode IMG-xxxx อัตโนมัติ + requester stamp
// - Visibility Scope module 'image_request' (own = requester/assignee)
// - state machine + กติกาผู้อนุมัติ (requester OR role ถือ A) — approve เป็นมนุษย์เท่านั้น
// - draft-prompt: deterministic เมื่อ AI ไม่ได้ตั้งค่า (test env blank key) / AI refine เมื่อ stub
// - versions ผ่าน AssetLink entityType 'image_request', comments ผ่าน Postit
// - ai-usage ผูก entityType 'image_request' ได้

const REQUESTER_EMAIL = 'img-requester@aistar.test';
const ASSIGNEE_EMAIL = 'img-assignee@aistar.test';
const LEAD_EMAIL = 'img-lead@aistar.test';
const OUTSIDER_EMAIL = 'img-outsider@aistar.test';
const NOPERM_EMAIL = 'img-noperm@aistar.test';
const SCOPED_EMAIL = 'img-scoped@aistar.test';
const PASSWORD = 'img-e2e-2026';

describe('Image Requests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let adminToken: string;
  let requesterToken: string;
  let assigneeToken: string;
  let leadToken: string; // creative_lead — ถือ A บน image_request
  let outsiderToken: string; // creator อีกคน — ไม่ใช่ผู้ขอ/ผู้รับผิดชอบ ไม่มี A
  let nopermToken: string; // dev_api — ไม่มีสิทธิ์ image_request เลย
  let scopedToken: string; // role viewScope 'own'

  let requesterId: string;
  let assigneeId: string;
  let scopedId: string;
  let brandId: string;
  let episodeId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    requesterId = await createUserWithRoles(prisma, REQUESTER_EMAIL, PASSWORD, ['creator']);
    assigneeId = await createUserWithRoles(prisma, ASSIGNEE_EMAIL, PASSWORD, ['character_designer']);
    await createUserWithRoles(prisma, LEAD_EMAIL, PASSWORD, ['creative_lead']);
    await createUserWithRoles(prisma, OUTSIDER_EMAIL, PASSWORD, ['creator']);
    await createUserWithRoles(prisma, NOPERM_EMAIL, PASSWORD, ['dev_api']);

    // role เฉพาะกิจ viewScope 'own' บน image_request (ไม่แตะ role ที่ seed)
    const ownRole = await prisma.role.upsert({
      where: { key: 'img_vsc_own' },
      update: {},
      create: { key: 'img_vsc_own', name: 'IMG own-scope (e2e)' },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_module: { roleId: ownRole.id, module: 'image_request' } },
      update: { actions: ['V', 'C'], viewScope: 'own' },
      create: { roleId: ownRole.id, module: 'image_request', actions: ['V', 'C'], viewScope: 'own' },
    });
    scopedId = await createUserWithRoles(prisma, SCOPED_EMAIL, PASSWORD, ['img_vsc_own']);

    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    requesterToken = await loginAs(app, REQUESTER_EMAIL, PASSWORD);
    assigneeToken = await loginAs(app, ASSIGNEE_EMAIL, PASSWORD);
    leadToken = await loginAs(app, LEAD_EMAIL, PASSWORD);
    outsiderToken = await loginAs(app, OUTSIDER_EMAIL, PASSWORD);
    nopermToken = await loginAs(app, NOPERM_EMAIL, PASSWORD);
    scopedToken = await loginAs(app, SCOPED_EMAIL, PASSWORD);

    // brand + brand book (สี token ต้องโผล่ใน draft prompt)
    const brand = await http(app)
      .post('/api/brands')
      .set(auth(adminToken))
      .send({ name: 'NARA แบรนด์ทดสอบงานภาพ' })
      .expect(201);
    brandId = brand.body.id;
    await http(app)
      .patch(`/api/brands/${brandId}`)
      .set(auth(adminToken))
      .send({
        toneOfVoice: 'อบอุ่น จริงใจ',
        moodNote: 'ภาพโทนอุ่น แสงธรรมชาติ',
        brandColors: [{ token: 'nara-amber', dark: '#f59e0b', light: '#b45309', usage: 'สีหลัก' }],
      })
      .expect(200);

    // episode สำหรับใช้เป็น target
    const ep = await http(app)
      .post('/api/episodes')
      .set(auth(adminToken))
      .send({ title: 'EP ทดสอบงานภาพ' })
      .expect(201);
    episodeId = ep.body.id;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function createRequest(token: string, body: Record<string, unknown> = {}) {
    return http(app)
      .post('/api/image-requests')
      .set(auth(token))
      .send({ title: 'แบนเนอร์โปรโมทเทศกาล', imageType: 'banner', ...body });
  }

  function uploadVersion(token: string, requestId: string) {
    return http(app)
      .post('/api/assets')
      .set(auth(token))
      .field('assetType', 'deliverable')
      .field('entityType', 'image_request')
      .field('entityId', requestId)
      .field('linkRole', 'deliverable')
      .attach('file', PNG_BUFFER, 'version.png');
  }

  // ── create ──────────────────────────────────────────────────

  it('create → auto IMG-xxxx + requester stamp + default open/normal', async () => {
    const res = await createRequest(requesterToken, {
      platform: 'facebook',
      sizeNote: '1200x628',
      copyText: 'ลดจริง 50%',
      brief: 'ภาพโปรเซ็ตของขวัญ โทนอุ่น',
      brandId,
      entityType: 'episode',
      entityId: episodeId,
    }).expect(201);

    expect(res.body.displayCode).toMatch(/^IMG-\d{4}$/);
    expect(res.body.requesterId).toBe(requesterId);
    expect(res.body.status).toBe('open');
    expect(res.body.priority).toBe('normal');
  });

  it('create with unknown brand → 404 / target ไม่ครบคู่ → 400 / target ไม่มีจริง → 404', async () => {
    await createRequest(requesterToken, { brandId: randomUUID() }).expect(404);
    await createRequest(requesterToken, { entityType: 'campaign' }).expect(400);
    await createRequest(requesterToken, { entityType: 'campaign', entityId: randomUUID() }).expect(
      404,
    );
  });

  it('no image_request permission (dev_api) → 403', async () => {
    await createRequest(nopermToken).expect(403);
    await http(app).get('/api/image-requests').set(auth(nopermToken)).expect(403);
  });

  // ── visibility scope (own) ──────────────────────────────────

  it('viewScope own: เห็นเฉพาะที่ตัวเองขอ/ได้รับมอบหมาย — งานคนอื่น list ไม่เห็น + detail 404', async () => {
    const mine = await createRequest(scopedToken, { title: 'งานที่ฉันขอเอง' }).expect(201);
    const assignedToMe = await createRequest(requesterToken, {
      title: 'งานที่มอบหมายให้ฉัน',
      assigneeId: scopedId,
    }).expect(201);
    const foreign = await createRequest(requesterToken, { title: 'งานของคนอื่น' }).expect(201);

    const list = await http(app).get('/api/image-requests').set(auth(scopedToken)).expect(200);
    const ids = list.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(mine.body.id);
    expect(ids).toContain(assignedToMe.body.id);
    expect(ids).not.toContain(foreign.body.id);

    await http(app).get(`/api/image-requests/${foreign.body.id}`).set(auth(scopedToken)).expect(404);
    await http(app).get(`/api/image-requests/${mine.body.id}`).set(auth(scopedToken)).expect(200);

    // default scope 'all' (creator) เห็นของคนอื่นได้
    await http(app).get(`/api/image-requests/${mine.body.id}`).set(auth(outsiderToken)).expect(200);
  });

  // ── status transitions ──────────────────────────────────────

  it('transition ผิดลำดับ → 400 (open→review, open→approved) และต้อง assign ก่อนเริ่มทำ', async () => {
    const req = await createRequest(requesterToken).expect(201);
    await http(app)
      .post(`/api/image-requests/${req.body.id}/status`)
      .set(auth(requesterToken))
      .send({ status: 'review' })
      .expect(400);
    await http(app)
      .post(`/api/image-requests/${req.body.id}/status`)
      .set(auth(requesterToken))
      .send({ status: 'approved' })
      .expect(400);
    // ยังไม่มอบหมาย → เริ่มทำไม่ได้
    await http(app)
      .post(`/api/image-requests/${req.body.id}/status`)
      .set(auth(requesterToken))
      .send({ status: 'in_progress' })
      .expect(400);
  });

  it('flow เต็ม: assign → in_progress → (ห้าม review ถ้าไม่มีภาพ) → upload → review → revision → review → approved โดยผู้ขอ', async () => {
    const req = await createRequest(requesterToken, { assigneeId }).expect(201);
    const id = req.body.id;

    await http(app)
      .post(`/api/image-requests/${id}/status`)
      .set(auth(assigneeToken))
      .send({ status: 'in_progress' })
      .expect(201);

    // ยังไม่มีเวอร์ชันภาพ → ส่งรีวิวไม่ได้
    await http(app)
      .post(`/api/image-requests/${id}/status`)
      .set(auth(assigneeToken))
      .send({ status: 'review' })
      .expect(400);

    const asset = await uploadVersion(assigneeToken, id).expect(201);

    await http(app)
      .post(`/api/image-requests/${id}/status`)
      .set(auth(assigneeToken))
      .send({ status: 'review' })
      .expect(201);

    // ขอแก้พร้อมคอมเมนต์ → กลับไป revision + comment โผล่ใน detail
    await http(app)
      .post(`/api/image-requests/${id}/status`)
      .set(auth(requesterToken))
      .send({ status: 'revision', comment: 'ขอปรับสีให้อุ่นขึ้น' })
      .expect(201);
    await http(app)
      .post(`/api/image-requests/${id}/status`)
      .set(auth(assigneeToken))
      .send({ status: 'review' })
      .expect(201);

    // approvedAssetId ต้องเป็นภาพที่ link กับงานนี้
    await http(app)
      .post(`/api/image-requests/${id}/status`)
      .set(auth(requesterToken))
      .send({ status: 'approved', approvedAssetId: randomUUID() })
      .expect(400);

    const approved = await http(app)
      .post(`/api/image-requests/${id}/status`)
      .set(auth(requesterToken))
      .send({ status: 'approved', approvedAssetId: asset.body.id })
      .expect(201);
    expect(approved.body.status).toBe('approved');
    expect(approved.body.approvedBy).toBe(requesterId);
    expect(approved.body.approvedAt).toBeTruthy();
    expect(approved.body.approvedAssetId).toBe(asset.body.id);

    const detail = await http(app)
      .get(`/api/image-requests/${id}`)
      .set(auth(requesterToken))
      .expect(200);
    expect(detail.body.versions.map((v: { id: string }) => v.id)).toContain(asset.body.id);
    expect(
      detail.body.comments.map((c: { content: string }) => c.content),
    ).toContain('ขอปรับสีให้อุ่นขึ้น');
  });

  it('approve: คนนอกไม่มี A → 403, ถือ A (creative_lead) → OK แม้ไม่ใช่ผู้ขอ', async () => {
    const req = await createRequest(requesterToken, { assigneeId }).expect(201);
    const id = req.body.id;
    await http(app)
      .post(`/api/image-requests/${id}/status`)
      .set(auth(assigneeToken))
      .send({ status: 'in_progress' })
      .expect(201);
    await uploadVersion(assigneeToken, id).expect(201);
    await http(app)
      .post(`/api/image-requests/${id}/status`)
      .set(auth(assigneeToken))
      .send({ status: 'review' })
      .expect(201);

    // creator คนนอก — ไม่ใช่ผู้ขอ ไม่มี A → 403
    await http(app)
      .post(`/api/image-requests/${id}/status`)
      .set(auth(outsiderToken))
      .send({ status: 'approved' })
      .expect(403);

    const approved = await http(app)
      .post(`/api/image-requests/${id}/status`)
      .set(auth(leadToken))
      .send({ status: 'approved' })
      .expect(201);
    expect(approved.body.status).toBe('approved');
  });

  // ── edit / cancel ───────────────────────────────────────────

  it('PATCH: คนนอกแก้ไม่ได้ (403), ผู้ขอแก้ brief/มอบหมายได้', async () => {
    const req = await createRequest(requesterToken).expect(201);
    await http(app)
      .patch(`/api/image-requests/${req.body.id}`)
      .set(auth(outsiderToken))
      .send({ brief: 'แอบแก้' })
      .expect(403);
    const updated = await http(app)
      .patch(`/api/image-requests/${req.body.id}`)
      .set(auth(requesterToken))
      .send({ brief: 'บรีฟใหม่', assigneeId, priority: 'urgent' })
      .expect(200);
    expect(updated.body.brief).toBe('บรีฟใหม่');
    expect(updated.body.assigneeId).toBe(assigneeId);
    expect(updated.body.priority).toBe('urgent');
  });

  it('cancel: assignee ยกเลิกไม่ได้ (403), ผู้ขอยกเลิกได้ → cancelled แล้วเดินต่อไม่ได้', async () => {
    const req = await createRequest(requesterToken, { assigneeId }).expect(201);
    await http(app)
      .delete(`/api/image-requests/${req.body.id}`)
      .set(auth(assigneeToken))
      .expect(403);
    const cancelled = await http(app)
      .delete(`/api/image-requests/${req.body.id}`)
      .set(auth(requesterToken))
      .expect(200);
    expect(cancelled.body.status).toBe('cancelled');
    await http(app)
      .post(`/api/image-requests/${req.body.id}/status`)
      .set(auth(requesterToken))
      .send({ status: 'in_progress' })
      .expect(400);
  });

  // ── draft prompt ────────────────────────────────────────────

  it('draft-prompt (AI ไม่ตั้งค่า) → deterministic + มีสี token จาก Brand Book + persist ลง draftPrompt', async () => {
    const req = await createRequest(requesterToken, {
      brandId,
      copyText: 'ลดจริง 50%',
      sizeNote: '9:16',
    }).expect(201);

    const res = await http(app)
      .post(`/api/image-requests/${req.body.id}/draft-prompt`)
      .set(auth(requesterToken))
      .expect(201);
    expect(res.body.provenance).toBe('deterministic');
    expect(res.body.draftPrompt).toContain('nara-amber');
    expect(res.body.draftPrompt).toContain('ลดจริง 50%');
    expect(res.body.draftPrompt).toContain('9:16');

    const detail = await http(app)
      .get(`/api/image-requests/${req.body.id}`)
      .set(auth(requesterToken))
      .expect(200);
    expect(detail.body.draftPrompt).toBe(res.body.draftPrompt);
  });

  it('draft-prompt (AI stubbed) → provenance ai + ใช้ prompt ที่เกลาแล้ว', async () => {
    const svc = app.get(AiClaudeService);
    jest.spyOn(svc, 'isConfigured').mockResolvedValue(true);
    jest.spyOn(svc, 'callClaude').mockImplementation(async () => {
      return {
        parsed: { prompt: 'AI refined banner prompt', negativePrompt: 'no watermark' },
        model: 'stub-model',
        usage: { inputTokens: 5, outputTokens: 10 },
        latencyMs: 1,
      } as ClaudeCallResult<unknown>;
    });

    const req = await createRequest(requesterToken, { brandId }).expect(201);
    const res = await http(app)
      .post(`/api/image-requests/${req.body.id}/draft-prompt`)
      .set(auth(requesterToken))
      .expect(201);
    expect(res.body.provenance).toBe('ai');
    expect(res.body.draftPrompt).toBe('AI refined banner prompt');
    expect(res.body.negativePrompt).toBe('no watermark');
  });

  // ── comments (Postit) + versions in list ────────────────────

  it('comment ผ่าน POST /postits (entityType image_request) → โผล่ใน detail + list มี versionCount', async () => {
    const req = await createRequest(requesterToken, { assigneeId }).expect(201);
    await http(app)
      .post('/api/postits')
      .set(auth(assigneeToken))
      .send({
        type: 'note',
        content: 'รับงานแล้ว เริ่มพรุ่งนี้',
        entityType: 'image_request',
        entityId: req.body.id,
      })
      .expect(201);
    await uploadVersion(assigneeToken, req.body.id).expect(201);

    const detail = await http(app)
      .get(`/api/image-requests/${req.body.id}`)
      .set(auth(requesterToken))
      .expect(200);
    expect(
      detail.body.comments.map((c: { content: string }) => c.content),
    ).toContain('รับงานแล้ว เริ่มพรุ่งนี้');

    const list = await http(app)
      .get(`/api/image-requests?q=${req.body.displayCode}`)
      .set(auth(requesterToken))
      .expect(200);
    const row = list.body.items.find((i: { id: string }) => i.id === req.body.id);
    expect(row.versionCount).toBe(1);
    expect(row.latestVersionAssetId).toBeTruthy();
    expect(row.requesterName).toBeTruthy();
  });

  // ── ai-usage integration ────────────────────────────────────

  it('ai-usage: link-search เจอ image request + บันทึก usage ผูก entityType image_request ได้', async () => {
    const req = await createRequest(requesterToken, { title: 'ภาพปกซีรีส์พิเศษ' }).expect(201);

    const search = await http(app)
      .get(`/api/ai-usage/link-search?q=${req.body.displayCode}`)
      .set(auth(requesterToken))
      .expect(200);
    expect(search.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: 'image_request', entityId: req.body.id }),
      ]),
    );

    const tool = await http(app)
      .post('/api/ai-tools')
      .set(auth(adminToken))
      .send({ name: `ChatGPT Images ${Date.now()}`, unit: 'flat', defaultRateBaht: 2 })
      .expect(201);

    const log = await http(app)
      .post('/api/ai-usage')
      .set(auth(requesterToken))
      .send({
        aiToolId: tool.body.id,
        usedAt: new Date().toISOString(),
        quantity: 4,
        outputsCount: 4,
        outputType: 'image',
        links: [{ entityType: 'image_request', entityId: req.body.id }],
      })
      .expect(201);
    expect(log.body.links[0].entityType).toBe('image_request');
    expect(log.body.links[0].label).toContain(req.body.displayCode);

    // entityType นอก whitelist ยังโดน 400 เหมือนเดิม
    await http(app)
      .post('/api/ai-usage')
      .set(auth(requesterToken))
      .send({
        aiToolId: tool.body.id,
        usedAt: new Date().toISOString(),
        quantity: 1,
        outputsCount: 1,
        outputType: 'image',
        links: [{ entityType: 'brand', entityId: brandId }],
      })
      .expect(400);
  });
});
