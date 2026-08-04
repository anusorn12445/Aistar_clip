import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AiClaudeService } from '../src/ai/ai-claude.service';
import type { ClaudeCallResult } from '../src/ai/ai-claude.service';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  auth,
  createApp,
  http,
  loginAs,
} from './utils';

const FAKE_ID = '00000000-0000-4000-8000-00000000ac02';

// UGC Studio v2 — สาย place/food + Resource Rail + concepts/plan v2 + gate ขยาย
// (สาย product ทดสอบใน clip-jobs.e2e-spec.ts — ไฟล์นี้โฟกัสของใหม่ v2)
// e2e MUST NOT call live AI — stub AiClaudeService.callClaude ตาม action
describe('UGC Studio v2 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;

  const ts = Date.now();
  let adminId: string;
  let productId: string;
  let handId: string;
  let characterId: string;
  let otherCharacterId: string;
  let wardrobeId: string;
  let otherWardrobeId: string;
  let voiceProfileId: string;
  let otherVoiceId: string;
  let locationId: string;
  const bannedTerm = `คำแบนยูจีซี${ts}`;

  const CONCEPTS_CANNED = {
    concepts: [
      {
        name: '🏨 ห้องนี้คืนละเท่าไหร่',
        fit: '🎯 เหมาะกับ: สายเที่ยวงบจำกัด',
        flow: '💸 เปิดหัวราคา → 🛎️ ล็อบบี้ → 🚪 เปิดประตูห้อง → 🛏️ ทัวร์ห้อง → 🏊 สระ → ✅ สรุปคุ้ม → 📲 จอง',
        highlight: '💡 จุดเด่น: ชูความคุ้มตั้งแต่วิแรก',
      },
      {
        name: '🌅 ตื่นมาเจอวิวนี้',
        fit: '🎯 เหมาะกับ: สายพักผ่อน/ฮันนีมูน',
        flow: '🌅 วิวหน้าต่าง → 🛏️ เตียงนุ่ม → 🍳 อาหารเช้า → 📲 จอง',
        highlight: '💡 จุดเด่น: ขายบรรยากาศ',
      },
      {
        name: '🧳 เช็คอินไวใน 1 นาที',
        fit: '🎯 เหมาะกับ: คนเดินทางบ่อย',
        flow: '🧳 ถึงหน้าโรงแรม → 🔑 เช็คอิน → 🚪 เข้าห้อง → 📲 จอง',
        highlight: '💡 จุดเด่น: ความสะดวก',
      },
    ],
  };

  const PLAN_CANNED = {
    headline: 'คืนละพันต้นๆ ได้ห้องวิวนี้',
    script: 'คืนละพันต้นๆ ได้ห้องแบบนี้ ล็อบบี้สวย ห้องกว้าง วิวดีมาก สรุปคุ้ม จองเลย ลิงก์ในคอมเมนต์',
    caption: 'ที่พักดีบอกต่อ 🏨 คุ้มเกินราคา',
    hashtags: ['#ที่พัก', '#hotelreview', '#เที่ยวไทย'],
    scenes: [
      {
        section: 'hook',
        sceneType: 'presenter',
        title: 'เปิดหัวราคา',
        cameraNote: 'medium · หน้าตรงเข้ากล้อง',
        durationSec: 5,
        dialogue: 'คืนละพันต้นๆ ได้ห้องแบบนี้จริงดิ',
        onScreenText: 'คืนละพันต้นๆ',
        reason: 'ชูราคาตั้งแต่วิแรก',
      },
      {
        section: 'demonstration',
        sceneType: 'hands',
        title: 'เปิดประตูห้อง',
        cameraNote: 'POV เปิดประตู · wide reveal',
        durationSec: 5,
        dialogue: 'เปิดประตูมาแบบ โห กว้างมาก',
        onScreenText: 'ห้องกว้างมาก',
        reason: 'moment ว้าวของสูตรโรงแรม',
      },
      {
        section: 'cta',
        sceneType: 'product_only',
        title: 'สรุปคุ้ม + จอง',
        cameraNote: 'wide ห้องเต็มเฟรม · แสงเช้า',
        durationSec: 4,
        dialogue: 'สรุปคุ้มมาก จองเลย ลิงก์ในคอมเมนต์',
        onScreenText: 'จองเลย',
        reason: 'ปิดด้วย CTA จอง',
      },
    ],
  };

  function stubClaude(): jest.SpyInstance {
    const svc = app.get(AiClaudeService);
    jest.spyOn(svc, 'isConfigured').mockResolvedValue(true);
    return jest.spyOn(svc, 'callClaude').mockImplementation(async (opts) => {
      if (opts.action === 'ai_ugc_concepts') {
        return {
          parsed: CONCEPTS_CANNED,
          model: 'stub-model',
          usage: { inputTokens: 10, outputTokens: 20 },
          latencyMs: 1,
        } as ClaudeCallResult<unknown>;
      }
      if (opts.action === 'ai_ugc_plan') {
        return {
          parsed: PLAN_CANNED,
          model: 'stub-model',
          usage: { inputTokens: 10, outputTokens: 20 },
          latencyMs: 1,
        } as ClaudeCallResult<unknown>;
      }
      throw new Error(`unexpected AI action in v2 spec: ${opts.action}`);
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await createApp();
    adminToken = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } })).id;

    const product = await http(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({ name: `สินค้า UGC v2 ${ts}`, category: 'beauty', price: 290 })
      .expect(201);
    productId = product.body.id;

    const hand = await http(app)
      .post('/api/hands')
      .set(auth(adminToken))
      .send({
        name: `มืออีสาน UGC ${ts}`,
        category: 'working',
        skinTone: 'tan',
        nailStyle: 'short natural',
        accessories: ['silver ring'],
        status: 'active',
      })
      .expect(201);
    handId = hand.body.id;

    const character = await prisma.character.create({
      data: {
        displayCode: `CHR-UGC-${ts}`,
        nameTh: `แจ๋ว UGC ${ts}`,
        nameEn: 'Jaew UGC',
        age: 28,
        gender: 'หญิง',
        visualDna: {
          ethnicity: 'Thai, Southeast Asian features',
          hair_style: 'shoulder-length black hair',
          skin_tone: 'warm tan',
        },
        createdBy: adminId,
      },
    });
    characterId = character.id;

    const otherCharacter = await prisma.character.create({
      data: {
        displayCode: `CHR-UGC2-${ts}`,
        nameTh: `ตัวสำรอง UGC ${ts}`,
        createdBy: adminId,
      },
    });
    otherCharacterId = otherCharacter.id;

    wardrobeId = (
      await prisma.characterWardrobe.create({
        data: {
          characterId,
          name: `ชุดไลฟ์สด UGC ${ts}`,
          description: 'เสื้อเชิ้ตขาว สะอาดตา',
        },
      })
    ).id;
    otherWardrobeId = (
      await prisma.characterWardrobe.create({
        data: { characterId: otherCharacterId, name: `ชุดของตัวสำรอง ${ts}` },
      })
    ).id;

    voiceProfileId = (
      await prisma.characterVoiceProfile.create({
        data: {
          characterId,
          voiceType: 'เสียงพูดรีวิว (หลัก)',
          tone: 'warm big-sister',
          accent: 'Isan-Central',
          speakingSpeed: 'medium',
          status: 'approved',
        },
      })
    ).id;
    otherVoiceId = (
      await prisma.characterVoiceProfile.create({
        data: { characterId: otherCharacterId, voiceType: 'เสียงตัวสำรอง', status: 'approved' },
      })
    ).id;

    locationId = (
      await prisma.location.create({
        data: {
          name: `โรงแรมริมน้ำ UGC ${ts}`,
          prompt: 'riverside boutique hotel room, warm morning light through sheer curtains',
          continuityNotes: 'หน้าต่างบานใหญ่อยู่ซ้ายเฟรมเสมอ',
          status: 'active',
        },
      })
    ).id;

    await prisma.bannedWord.create({
      data: {
        term: bannedTerm,
        platforms: [],
        severity: 'ban',
        replacement: 'คำปลอดภัย',
        status: 'active',
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.bannedWord.deleteMany({ where: { term: bannedTerm } });
    await app.close();
    await prisma.$disconnect();
  });

  // ── A) create: subject 3 ประเภท + validation + cta defaults ──
  it('create place job: brief validation (name/category) + cta default map + ชื่อ default', async () => {
    // ไม่มี subjectBrief.name → 400
    await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ subjectType: 'place', subjectBrief: { category: 'cafe' } })
      .expect(400);
    // category นอก recipe keys → 400
    await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ subjectType: 'place', subjectBrief: { name: `คาเฟ่ ${ts}`, category: 'museum' } })
      .expect(400);

    const res = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({
        subjectType: 'place',
        subjectBrief: {
          name: `คาเฟ่กลางสวน ${ts}`,
          category: 'cafe',
          highlights: ['ลาเต้อาร์ตสวย', 'มุมถ่ายรูปเยอะ'],
          vibe: 'อบอุ่น มินิมอล',
          priceRange: '60-150 บาท',
        },
        platform: 'tiktok',
      })
      .expect(201);
    expect(res.body.subjectType).toBe('place');
    expect(res.body.productId).toBeNull();
    expect(res.body.ctaType).toBe('map'); // place default
    expect(res.body.name).toBe(`รีวิว คาเฟ่กลางสวน ${ts}`);
    expect(res.body.subjectBrief.category).toBe('cafe');
    expect(res.body.subjectBrief.highlights).toEqual(['ลาเต้อาร์ตสวย', 'มุมถ่ายรูปเยอะ']);
  });

  it('create place hotel → cta default booking, create food → cta map + category default menu', async () => {
    const hotel = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({
        subjectType: 'place',
        subjectBrief: { name: `โรงแรมทดสอบ ${ts}`, category: 'hotel' },
      })
      .expect(201);
    expect(hotel.body.ctaType).toBe('booking');

    const food = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({
        subjectType: 'food',
        subjectBrief: { name: `ก๋วยเตี๋ยวเรือ ${ts}`, highlights: ['น้ำซุปเข้มข้น'] },
      })
      .expect(201);
    expect(food.body.ctaType).toBe('map');
    expect(food.body.subjectBrief.category).toBe('menu');

    // product ต้องมี productId
    await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ subjectType: 'product' })
      .expect(400);
  });

  it('Resource Rail validation 400s: wardrobe/voice ต้องเป็นของตัวละคร + location/voice ต้องมีจริง', async () => {
    const base = { productId };
    // wardrobe โดยไม่เลือกตัวละคร → 400
    await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ ...base, wardrobeId })
      .expect(400);
    // wardrobe ของตัวละครอื่น → 400
    await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ ...base, characterId, wardrobeId: otherWardrobeId })
      .expect(400);
    // voice ของตัวละครอื่น (เมื่อเลือกตัวละคร) → 400
    await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ ...base, characterId, voiceProfileId: otherVoiceId })
      .expect(400);
    // fake location / voice → 400
    await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ ...base, locationId: FAKE_ID })
      .expect(400);
    await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ ...base, voiceProfileId: FAKE_ID })
      .expect(400);
    // ครบชุดถูกต้อง → ผ่าน (ไม่เลือกตัวละคร → ใช้เสียงของใครก็ได้)
    const ok = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ ...base, characterId, wardrobeId, voiceProfileId, handId, locationId })
      .expect(201);
    expect(ok.body.wardrobeId).toBe(wardrobeId);
    const anyVoice = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ ...base, voiceProfileId: otherVoiceId })
      .expect(201);
    expect(anyVoice.body.voiceProfileId).toBe(otherVoiceId);
  });

  // ── B) concepts: emoji + reroll history + cap 5 ──
  it('concepts: stores set (emoji ครบ) + reroll append history + cap 5 → 400', async () => {
    stubClaude();
    const job = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({
        subjectType: 'place',
        subjectBrief: { name: `โรงแรมคอนเซปต์ ${ts}`, category: 'hotel' },
      })
      .expect(201);

    const first = await http(app)
      .post(`/api/clip-jobs/${job.body.id}/concepts`)
      .set(auth(adminToken))
      .expect(201);
    expect(first.body.concepts).toHaveLength(3);
    expect(first.body.setIndex).toBe(0);
    expect(first.body.concepts[0].name).toContain('🏨'); // emoji นำชื่อ
    expect(first.body.concepts[0].fit).toContain('🎯');
    expect(first.body.concepts[0].flow).toContain('→');
    expect(first.body.concepts[0].highlight).toContain('💡');

    // reroll → append set ใหม่ current ขยับ
    const second = await http(app)
      .post(`/api/clip-jobs/${job.body.id}/concepts`)
      .set(auth(adminToken))
      .expect(201);
    expect(second.body.setIndex).toBe(1);
    expect(second.body.setCount).toBe(2);

    const detail = await http(app).get(`/api/clip-jobs/${job.body.id}`).set(auth(adminToken)).expect(200);
    expect(detail.body.conceptsJson.sets).toHaveLength(2);
    expect(detail.body.conceptsJson.current).toBe(1);
    expect(detail.body.conceptsJson.sets[0][0].name).toContain('🏨');

    // ขอจนครบ 5 ชุด → ครั้งที่ 6 ติด cap 400
    for (let i = 2; i < 5; i++) {
      await http(app).post(`/api/clip-jobs/${job.body.id}/concepts`).set(auth(adminToken)).expect(201);
    }
    await http(app).post(`/api/clip-jobs/${job.body.id}/concepts`).set(auth(adminToken)).expect(400);
  });

  // ── C) plan v2 — hotel job ครบ Resource Rail ──
  let hotelJobId: string;
  let hotelShots: Array<Record<string, unknown>> = [];

  it('plan hotel job → materializes sceneType/voiceType/onScreenText/headline/voiceSpec + skip director + booking CTA ใน prompt', async () => {
    const spy = stubClaude();
    const job = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({
        subjectType: 'place',
        subjectBrief: {
          name: `โรงแรมริมน้ำ ${ts}`,
          category: 'hotel',
          highlights: ['วิวแม่น้ำ', 'อาหารเช้าอร่อย'],
          priceRange: 'คืนละ 1,290',
        },
        characterId,
        wardrobeId,
        voiceProfileId,
        handId,
        locationId,
        platform: 'tiktok',
        targetDurationSec: 45,
        affiliateLink: 'https://agoda.example/riverside',
      })
      .expect(201);
    hotelJobId = job.body.id;
    expect(job.body.ctaType).toBe('booking');

    await http(app).post(`/api/clip-jobs/${hotelJobId}/concepts`).set(auth(adminToken)).expect(201);

    // conceptIndex เกินชุด → 400
    await http(app)
      .post(`/api/clip-jobs/${hotelJobId}/plan`)
      .set(auth(adminToken))
      .send({ conceptIndex: 9 })
      .expect(400);

    const planned = await http(app)
      .post(`/api/clip-jobs/${hotelJobId}/plan`)
      .set(auth(adminToken))
      .send({ conceptIndex: 0 })
      .expect(201);

    expect(planned.body.status).toBe('review');
    expect(planned.body.selectedConceptIndex).toBe(0);
    expect(planned.body.headline).toBe(PLAN_CANNED.headline);
    expect(planned.body.directorRunId).toBeNull(); // place → ข้าม Director (ไม่มี product state machine)
    // voiceSpec compose จาก CharacterVoiceProfile (tone/accent/speed)
    expect(planned.body.voiceSpec).toContain('เสียงพูดรีวิว (หลัก)');
    expect(planned.body.voiceSpec).toContain('warm big-sister');
    expect(planned.body.voiceSpec).toContain('Isan-Central');

    hotelShots = planned.body.shots;
    expect(hotelShots).toHaveLength(3);
    expect(hotelShots[0]).toEqual(
      expect.objectContaining({ sceneType: 'presenter', voiceType: 'on_camera', onScreenText: 'คืนละพันต้นๆ' }),
    );
    expect(hotelShots[1]).toEqual(
      expect.objectContaining({ sceneType: 'hands', voiceType: 'female_vo', onScreenText: 'ห้องกว้างมาก' }),
    );
    expect(hotelShots[2]).toEqual(
      expect.objectContaining({ sceneType: 'product_only', voiceType: 'female_vo' }),
    );

    // prompt วางแผนต้องสั่งปิดด้วย CTA ของ ctaType booking (Layer prompt)
    const planCall = spy.mock.calls.find(
      (c) => (c[0] as { action: string }).action === 'ai_ugc_plan',
    );
    expect(planCall).toBeDefined();
    const planOpts = planCall![0] as { system: string; content: string };
    expect(planOpts.system).toContain('จองเลย ลิงก์ในคอมเมนต์');
    expect(planOpts.system).toContain('wide room reveal'); // recipe emphasis ของ hotel เข้า prompt
    expect(planOpts.content).toContain(`โรงแรมริมน้ำ ${ts}`);
  });

  it('presenter shot → Master Prompt DIRECTIVE + wardrobe lock, hands shot → hand descriptor, product_only → no-people rule', async () => {
    const s0 = hotelShots[0] as { stillPrompt: string };
    expect(s0.stillPrompt).toContain('=== DIRECTIVE ===');
    expect(s0.stillPrompt).toContain('Outfit lock');
    expect(s0.stillPrompt).toContain(`ชุดไลฟ์สด UGC ${ts}`);
    expect(s0.stillPrompt).toContain('faces the camera'); // scene-type hard rule presenter

    const s1 = hotelShots[1] as { stillPrompt: string };
    expect(s1.stillPrompt).toContain(`มืออีสาน UGC ${ts}`); // hand descriptor
    expect(s1.stillPrompt).toContain('no face visible');

    const s2 = hotelShots[2] as { stillPrompt: string };
    expect(s2.stillPrompt).toContain('No people, no hands, no human shadows');
  });

  it('ทุกฉากฝัง location block + subject reference (place) + recipe emphasis; motion มี Voice/Dialogue block', async () => {
    for (const shot of hotelShots as { stillPrompt: string; motionPrompt: string; dialogue: string }[]) {
      // location block (prompt + continuity) ทุกฉาก
      expect(shot.stillPrompt).toContain('riverside boutique hotel room');
      expect(shot.stillPrompt).toContain('หน้าต่างบานใหญ่อยู่ซ้ายเฟรมเสมอ');
      // subject reference line ของ place/food
      expect(shot.stillPrompt).toContain('Use the attached photos of the real place/dish as reference');
      // recipe promptEmphasis ของ hotel
      expect(shot.stillPrompt).toContain('wide room reveal');
      // motion: ฟอร์แมต mockup — first frame + Voice + Dialogue + Important
      expect(shot.motionPrompt).toContain('Use the attached Scene');
      expect(shot.motionPrompt).toContain('Voice:');
      expect(shot.motionPrompt).toContain('Isan-Central'); // voiceSpec ในบล็อก Voice
      expect(shot.motionPrompt).toContain('Dialogue:');
      expect(shot.motionPrompt).toContain(shot.dialogue);
      expect(shot.motionPrompt).toContain('No subtitles, no watermark');
      expect(shot.motionPrompt).toContain('no morphing');
    }
  });

  it('food job plan → recipe menu emphasis (steam rising) + cta map ใน prompt', async () => {
    const spy = stubClaude();
    const job = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({
        subjectType: 'food',
        subjectBrief: { name: `ชีสยืดหม้อไฟ ${ts}`, highlights: ['ชีสยืดยาว'] },
        platform: 'tiktok',
      })
      .expect(201);
    await http(app).post(`/api/clip-jobs/${job.body.id}/concepts`).set(auth(adminToken)).expect(201);
    const planned = await http(app)
      .post(`/api/clip-jobs/${job.body.id}/plan`)
      .set(auth(adminToken))
      .send({ conceptIndex: 1 })
      .expect(201);

    expect(planned.body.selectedConceptIndex).toBe(1);
    expect(planned.body.voiceSpec).toContain('Thai female voice'); // default voice spec
    const shot = planned.body.shots[1];
    expect(shot.stillPrompt).toContain('steam rising'); // food/menu promptEmphasis
    const planOpts = spy.mock.calls.find(
      (c) => (c[0] as { action: string }).action === 'ai_ugc_plan',
    )![0] as { system: string };
    expect(planOpts.system).toContain('พิกัดในคอมเมนต์'); // cta map closing
  });

  // ── D) gate ขยาย: onScreenText + headline เข้า scan ──
  it('banned gate: onScreenText ติดคำแบน → detail ชี้ตำแหน่ง + PATCH ready → 400, แก้แล้วผ่าน', async () => {
    const shotId = (hotelShots[1] as { id: string }).id;
    await http(app)
      .patch(`/api/clip-jobs/${hotelJobId}/shots/${shotId}`)
      .set(auth(adminToken))
      .send({ onScreenText: `โปรนี้${bannedTerm}` })
      .expect(200);

    const detail = await http(app).get(`/api/clip-jobs/${hotelJobId}`).set(auth(adminToken)).expect(200);
    expect(detail.body.compliance.hasBan).toBe(true);
    const match = detail.body.compliance.matches.find(
      (m: { source: string; term: string }) => m.source === 'onScreenText' && m.term === bannedTerm,
    );
    expect(match).toBeDefined();
    expect(match.label).toContain('ข้อความบนจอ');

    // HARD BLOCK — ตั้ง ready ไม่ได้จนกว่าจะแก้
    await http(app)
      .patch(`/api/clip-jobs/${hotelJobId}`)
      .set(auth(adminToken))
      .send({ status: 'ready' })
      .expect(400);

    // แก้ข้อความ → ตั้ง ready ผ่าน
    await http(app)
      .patch(`/api/clip-jobs/${hotelJobId}/shots/${shotId}`)
      .set(auth(adminToken))
      .send({ onScreenText: 'ห้องกว้างมาก' })
      .expect(200);
    await http(app)
      .patch(`/api/clip-jobs/${hotelJobId}`)
      .set(auth(adminToken))
      .send({ status: 'ready' })
      .expect(200);
  });

  it('banned gate: headline ติดคำแบนก็บล็อก (additive แหล่ง scan ใหม่)', async () => {
    await http(app)
      .patch(`/api/clip-jobs/${hotelJobId}`)
      .set(auth(adminToken))
      .send({ headline: `พาดหัว${bannedTerm}`, status: 'published' })
      .expect(400);
    const detail = await http(app).get(`/api/clip-jobs/${hotelJobId}`).set(auth(adminToken)).expect(200);
    expect(detail.body.status).not.toBe('published');
  });

  // ── E) shot patch v2 fields + package v2 ──
  it('shot PATCH sceneType → voiceType auto ปรับตาม + recompose เคารพ sceneType ใหม่', async () => {
    const shotId = (hotelShots[0] as { id: string }).id;
    const patched = await http(app)
      .patch(`/api/clip-jobs/${hotelJobId}/shots/${shotId}`)
      .set(auth(adminToken))
      .send({ sceneType: 'product_only' })
      .expect(200);
    expect(patched.body.sceneType).toBe('product_only');
    expect(patched.body.voiceType).toBe('female_vo'); // auto จาก sceneType

    const rec = await http(app)
      .post(`/api/clip-jobs/${hotelJobId}/shots/${shotId}/recompose`)
      .set(auth(adminToken))
      .expect(201);
    expect(rec.body.stillPrompt).toContain('No people, no hands, no human shadows');
    expect(rec.body.stillPrompt).not.toContain('=== DIRECTIVE ==='); // ไม่ใช่ฉากตัวละครแล้ว

    // เปลี่ยนกลับ presenter → recompose กลับมาใช้ Master Prompt
    await http(app)
      .patch(`/api/clip-jobs/${hotelJobId}/shots/${shotId}`)
      .set(auth(adminToken))
      .send({ sceneType: 'presenter' })
      .expect(200);
    const rec2 = await http(app)
      .post(`/api/clip-jobs/${hotelJobId}/shots/${shotId}/recompose`)
      .set(auth(adminToken))
      .expect(201);
    expect(rec2.body.stillPrompt).toContain('=== DIRECTIVE ===');
  });

  it('package v2: subject place + ctaLine booking + ข้อความขึ้นจอ (headline + ต่อฉาก) + sceneType ต่อ shot', async () => {
    const pack = await http(app)
      .get(`/api/clip-jobs/${hotelJobId}/package`)
      .set(auth(adminToken))
      .expect(200);
    expect(pack.body.job.subjectType).toBe('place');
    expect(pack.body.job.subject.name).toBe(`โรงแรมริมน้ำ ${ts}`);
    expect(pack.body.job.subject.category).toBe('hotel');
    expect(pack.body.ctaType).toBe('booking');
    expect(pack.body.ctaLine).toBe('จองเลย ลิงก์ในคอมเมนต์');
    expect(pack.body.voiceSpec).toContain('Isan-Central');
    expect(pack.body.affiliateLink).toBe('https://agoda.example/riverside');
    // ข้อความขึ้นจอ: พาดหัว (จาก PATCH ก่อนหน้า) + ต่อฉาก
    const labels = pack.body.onScreenTexts.map((t: { label: string }) => t.label);
    expect(labels[0]).toBe('พาดหัวฉากแรก');
    expect(pack.body.onScreenTexts.length).toBeGreaterThanOrEqual(3);
    expect(pack.body.shots[0].sceneType).toBeDefined();
    expect(pack.body.shots[1].onScreenText).toBe('ห้องกว้างมาก');
  });

  // ── F) legacy v1 compatibility ──
  it('legacy v1 job (product, ไม่มี concepts) → detail/package render ปกติ + list subject enrich', async () => {
    const job = await http(app)
      .post('/api/clip-jobs')
      .set(auth(adminToken))
      .send({ productId, name: `เลกาซี่ v1 ${ts}` })
      .expect(201);

    // เพิ่ม shot แบบ v1 (ไม่ส่ง sceneType) → default hands + voiceType auto
    await http(app)
      .put(`/api/clip-jobs/${job.body.id}/shots`)
      .set(auth(adminToken))
      .send({ shots: [{ section: 'hook', dialogue: 'ดูนี่ก่อน' }] })
      .expect(200);

    const detail = await http(app).get(`/api/clip-jobs/${job.body.id}`).set(auth(adminToken)).expect(200);
    expect(detail.body.subject.type).toBe('product');
    expect(detail.body.subject.name).toBe(`สินค้า UGC v2 ${ts}`);
    expect(detail.body.shots[0].sceneType).toBe('hands');
    expect(detail.body.conceptsJson).toBeNull();

    const pack = await http(app).get(`/api/clip-jobs/${job.body.id}/package`).set(auth(adminToken)).expect(200);
    expect(pack.body.job.product.name).toBe(`สินค้า UGC v2 ${ts}`);
    expect(pack.body.headline).toBeNull();
    expect(pack.body.onScreenTexts).toEqual([]);
    expect(pack.body.ctaLine).toBe('จิ้มตะกร้าเลย');

    const list = await http(app)
      .get(`/api/clip-jobs?subjectType=product&q=เลกาซี่ v1 ${ts}`)
      .set(auth(adminToken))
      .expect(200);
    const row = list.body.items.find((r: { id: string }) => r.id === job.body.id);
    expect(row.subject).toEqual(
      expect.objectContaining({ type: 'product', name: `สินค้า UGC v2 ${ts}` }),
    );
  });
});
