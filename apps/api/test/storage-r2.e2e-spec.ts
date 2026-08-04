import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Readable } from 'node:stream';
import {
  R2StorageDriver,
  StorageService,
} from '../src/assets/storage.service';
import type { SettingsService } from '../src/settings/settings.service';
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

// Fake SettingsService — คืนค่าตาม map ที่กำหนด (จำลอง DB→env resolution)
function fakeSettings(values: Record<string, string | undefined>): SettingsService {
  return {
    get: async (key: string) => values[key],
  } as unknown as SettingsService;
}

// R2 config ครบชุด ใช้ทดสอบการเลือก R2 driver
const R2_VALUES = {
  R2_ACCOUNT_ID: 'acc123',
  R2_ACCESS_KEY_ID: 'ak-test',
  R2_SECRET_ACCESS_KEY: 'sk-test',
  R2_BUCKET: 'aistar-bucket',
};

// ---------------------------------------------------------------------------
// Facade driver-selection (ไม่ยิง network จริงไป R2 — mock SettingsService)
// ---------------------------------------------------------------------------
describe('StorageService driver selection (unit)', () => {
  it('ไม่มีค่า R2 → เลือก local disk', async () => {
    const service = new StorageService(fakeSettings({}));
    expect(await service.isR2Configured()).toBe(false);
    expect(await service.getR2Driver()).toBeNull();

    // save() dispatch ไป local driver
    const local = service.getLocalDriver();
    const spy = jest.spyOn(local, 'save').mockResolvedValue(undefined);
    await service.save(Buffer.from('hi'), 'assets/selftest.txt');
    expect(spy).toHaveBeenCalledWith(expect.any(Buffer), 'assets/selftest.txt');
    spy.mockRestore();
  });

  it('R2 ครบทั้ง 4 ค่า → เลือก R2 driver + สร้าง S3 client endpoint/bucket ถูกต้อง', async () => {
    const service = new StorageService(fakeSettings(R2_VALUES));
    expect(await service.isR2Configured()).toBe(true);

    const driver = (await service.getR2Driver()) as R2StorageDriver;
    expect(driver).toBeInstanceOf(R2StorageDriver);

    // config ถูกส่งเข้า driver ครบ
    const cfg = (driver as unknown as { cfg: Record<string, string> }).cfg;
    expect(cfg).toEqual({
      accountId: 'acc123',
      accessKeyId: 'ak-test',
      secretAccessKey: 'sk-test',
      bucket: 'aistar-bucket',
    });

    // S3 client ถูก construct ด้วย region auto + endpoint R2 ของ account นี้
    const client = (driver as unknown as { client: { config: { endpoint: () => Promise<{ hostname: string; protocol: string }>; region: () => Promise<string> } } }).client;
    const ep = await client.config.endpoint();
    expect(ep.hostname).toBe('acc123.r2.cloudflarestorage.com');
    expect(ep.protocol).toBe('https:');
    expect(await client.config.region()).toBe('auto');

    // save() dispatch ไป R2 driver (ไม่ใช่ local) — spy กัน network จริง
    const saveSpy = jest.spyOn(driver, 'save').mockResolvedValue(undefined);
    await service.save(Buffer.from('x'), 'assets/x.txt');
    expect(saveSpy).toHaveBeenCalledWith(expect.any(Buffer), 'assets/x.txt');
    saveSpy.mockRestore();
  });

  it('getStream ของ local driver คืน stream.Readable (async read path)', async () => {
    const service = new StorageService(fakeSettings({}));
    const local = service.getLocalDriver();
    // จำลองไฟล์ผ่าน spy — พิสูจน์ว่า facade await getStream แล้วได้ Readable
    const fake = Readable.from(Buffer.from('bytes'));
    jest.spyOn(local, 'getStream').mockResolvedValue(fake);
    const stream = await service.getStream('assets/whatever.png');
    expect(stream).toBeInstanceOf(Readable);
    jest.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// Migrate endpoint — permission (asset X = admin-only) + guard เมื่อ R2 ยังไม่ตั้งค่า
// ---------------------------------------------------------------------------
describe('POST /assets/migrate-to-r2 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let researcherToken: string;

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

  it('researcher (ไม่มีสิทธิ์ asset X) → 403', async () => {
    await http(app)
      .post('/api/assets/migrate-to-r2')
      .set(auth(researcherToken))
      .expect(403);
  });

  it('admin แต่ R2 ยังไม่ตั้งค่าใน test env → 400 (graceful, ไม่ยิง network)', async () => {
    const res = await http(app)
      .post('/api/assets/migrate-to-r2')
      .set(auth(adminToken))
      .expect(400);
    expect(res.body.message).toContain('R2');
  });
});
