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

// TODO: enable after SettingsModule registered — integrator ต้อง import SettingsModule
// ใน src/app.module.ts ก่อน แล้วเปลี่ยน describe.skip เป็น describe
// หมายเหตุ: suite นี้เขียน ANTHROPIC_API_KEY ลง test DB ชั่วคราว (ลบตอนจบ) — ถ้า jest รัน
// parallel อาจชนกับ ai.e2e-spec ที่ assert 503-without-key; ถ้าเจอ flake ให้รันด้วย --runInBand
describe('System Settings (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let researcherToken: string;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    await ensureResearcher(prisma);
    researcherToken = await loginAs(app, RESEARCHER_EMAIL, RESEARCHER_PASSWORD);
  });

  afterAll(async () => {
    await prisma.systemSetting.deleteMany({});
    await prisma.$disconnect();
    await app.close();
  });

  it('GET /settings → grouped whitelist (admin, setting V)', async () => {
    const res = await http(app).get('/api/settings').set(auth(adminToken)).expect(200);
    const groups = res.body.groups as { group: string; items: { key: string }[] }[];
    expect(groups.map((g) => g.group)).toEqual(['ai', 'storage', 'notify']);
    const aiKeys = groups[0].items.map((i) => i.key);
    expect(aiKeys).toEqual(['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'OPENAI_API_KEY', 'XAI_API_KEY']);
  });

  it('GET /settings → 403 for non-admin (researcher)', async () => {
    await http(app).get('/api/settings').set(auth(researcherToken)).expect(403);
  });

  it('PUT /settings → 403 for non-admin (researcher)', async () => {
    await http(app)
      .put('/api/settings')
      .set(auth(researcherToken))
      .send({ items: [{ key: 'ANTHROPIC_MODEL', value: 'claude-opus-4-8' }] })
      .expect(403);
  });

  it('PUT /settings with non-whitelisted key → 400 Thai message', async () => {
    const res = await http(app)
      .put('/api/settings')
      .set(auth(adminToken))
      .send({ items: [{ key: 'DATABASE_URL', value: 'hack' }] })
      .expect(400);
    expect(res.body.message).toContain('ไม่รู้จัก setting key');
  });

  it('PUT /settings upserts secret → preview masks all but last 4 chars', async () => {
    const res = await http(app)
      .put('/api/settings')
      .set(auth(adminToken))
      .send({ items: [{ key: 'ANTHROPIC_API_KEY', value: 'sk-ant-test-1234abcd' }] })
      .expect(200);
    const item = (res.body.groups[0].items as {
      key: string;
      hasValue: boolean;
      source: string | null;
      preview: string | null;
    }[]).find((i) => i.key === 'ANTHROPIC_API_KEY')!;
    expect(item.hasValue).toBe(true);
    expect(item.source).toBe('db');
    expect(item.preview).toBe('••••abcd');
    expect(item.preview).not.toContain('sk-ant');
  });

  it('DB value overrides env → /ai/status now reports configured', async () => {
    const res = await http(app).get('/api/ai/status').set(auth(adminToken)).expect(200);
    expect(res.body.configured).toBe(true);
  });

  it('audit row settings_update records keys only — never values', async () => {
    const log = await prisma.auditLog.findFirst({
      where: { action: 'settings_update' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toBeTruthy();
    const meta = log!.meta as { keys: string[] };
    expect(meta.keys).toContain('ANTHROPIC_API_KEY');
    expect(JSON.stringify(log!.meta)).not.toContain('sk-ant');
  });

  it('PUT /settings with empty value deletes DB row (revert to env fallback)', async () => {
    const res = await http(app)
      .put('/api/settings')
      .set(auth(adminToken))
      .send({ items: [{ key: 'ANTHROPIC_API_KEY', value: '' }] })
      .expect(200);
    const item = (res.body.groups[0].items as {
      key: string;
      source: string | null;
    }[]).find((i) => i.key === 'ANTHROPIC_API_KEY')!;
    // test env ไม่มี ANTHROPIC_API_KEY ใน .env → กลับไปเป็นไม่ตั้งค่า
    expect(item.source).not.toBe('db');
    const row = await prisma.systemSetting.findUnique({ where: { key: 'ANTHROPIC_API_KEY' } });
    expect(row).toBeNull();
  });
});
