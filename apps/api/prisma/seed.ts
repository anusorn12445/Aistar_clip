process.env.PRISMA_ADAPTER='pg';
process.env.DATABASE_URL='postgresql://aistar:aistar@localhost:5432/aistar';
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ── UGC prompt/สูตรคลิป overrides ที่แก้เอง (backup จาก system_settings) ──
// โหลดเข้า system_settings ตอน seed → fresh setup พร้อมใช้พรอมป์ที่ปรับไว้เลย
// create-if-absent: ไม่ทับค่าที่ user แก้สดบน DB เดิม (ตามแบบ seed อื่นในไฟล์นี้)
async function seedUgcPromptOverrides(adminId: string): Promise<string> {
  const file = path.join(__dirname, 'seed-data', 'ugc-prompt-overrides.json');
  if (!fs.existsSync(file)) return 'ugc overrides: (ไม่พบไฟล์ seed-data — ข้าม)';
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return 'ugc overrides: (อ่าน JSON ไม่ได้ — ข้าม)';
  }
  let created = 0;
  const keys = Object.keys(data);
  for (const key of keys) {
    if (!key.startsWith('ugc.')) continue;
    const value = JSON.stringify(data[key]);
    const existing = await prisma.systemSetting.findUnique({ where: { key }, select: { key: true } });
    if (existing) continue; // ไม่ทับ user edit
    await prisma.systemSetting.create({ data: { key, value, updatedBy: adminId } });
    created++;
  }
  return `ugc overrides +${created}/${keys.length}`;
}

// Permission Matrix จาก addendum §C (V=View, C=Create/Edit, A=Approve, P=Publish, E=Export, X=Admin)
const ROLES: Record<string, { name: string; perms: Record<string, string[]> }> = {
  admin: {
    name: 'Admin',
    perms: {
      character: ['V', 'C', 'A', 'E', 'X'], asset: ['V', 'C', 'A', 'E', 'X'],
      prompt: ['V', 'C', 'A', 'E', 'X'], task: ['V', 'C', 'A', 'X'], user: ['V', 'C', 'X'],
      product: ['V', 'C', 'A', 'X'], campaign: ['V', 'C', 'A', 'X'], job: ['V', 'C', 'A', 'X'], episode: ['V', 'C', 'A', 'X'],
      location: ['V', 'C', 'A', 'X'], voice: ['V', 'C', 'A', 'X'], rights: ['V', 'C', 'A', 'X'],
      // library = Hand Library + Gesture Library (Product Interaction Library slice 1)
      library: ['V', 'C', 'A', 'X'],
      qc: ['V', 'C', 'A', 'X'], content: ['V', 'C', 'A', 'P', 'X'], live: ['V', 'C', 'A', 'P', 'X'],
      performance: ['V', 'C', 'X'], competitor: ['V', 'C', 'X'], idea: ['V', 'C', 'X'], postit: ['V', 'C', 'X'],
      setting: ['V', 'C', 'X'],
      // ai_usage: admin เต็ม (V=ดู C=บันทึก A=จัดการ tool/top-up X=ลบ/เห็นทุกคน)
      ai_usage: ['V', 'C', 'A', 'X'],
      image_request: ['V', 'C', 'A', 'E', 'X'],
    },
  },
  founder: {
    name: 'Founder / Management',
    perms: {
      character: ['V', 'A', 'E'], asset: ['V'], prompt: ['V'], task: ['V', 'C'],
      product: ['V'], campaign: ['V', 'C', 'A'], job: ['V', 'C', 'A'], episode: ['V'], location: ['V'], voice: ['V'],
      library: ['V'],
      rights: ['V', 'C', 'A'], qc: ['V'], content: ['V', 'A'], live: ['V', 'A'],
      performance: ['V'], competitor: ['V'], idea: ['V', 'C'], postit: ['V', 'C'], user: ['V'],
      ai_usage: ['V', 'C'], // CEO เห็นทุกคนผ่าน FINANCE_ROLES; จัดการ tool = admin เท่านั้น
      setting: ['V', 'C'], // ผู้บริหารดู/ตั้งค่า KPI + Assignment Hub ได้ (ไม่รวมสิทธิ์ลบระบบ X)
      image_request: ['V', 'C', 'A'], // ผู้บริหารอนุมัติงานภาพได้ (mirror content A)
    },
  },
  creative_lead: {
    name: 'Creative Lead',
    perms: {
      character: ['V', 'C', 'A', 'E'], asset: ['V', 'C', 'A'], prompt: ['V', 'C', 'A'], task: ['V', 'C', 'A'],
      product: ['V'], campaign: ['V', 'C', 'A'], job: ['V', 'C', 'A'], episode: ['V', 'C', 'A'], location: ['V', 'C', 'A'],
      voice: ['V', 'C', 'A'], rights: ['V'], qc: ['V', 'C', 'A'], content: ['V', 'A'], live: ['V'],
      library: ['V', 'C', 'A'],
      performance: ['V'], competitor: ['V'], idea: ['V', 'C'], postit: ['V', 'C'],
      ai_usage: ['V', 'C'],
      setting: ['V', 'C'], // Creative Lead จัดการทีม/KPI ผ่าน Assignment Hub ได้
      image_request: ['V', 'C', 'A', 'E'], // หัวหน้าครีเอทีฟ = ผู้อนุมัติหลักของงานภาพ
    },
  },
  character_designer: {
    name: 'Character Designer / Artist',
    perms: {
      character: ['V', 'C'], asset: ['V', 'C'], prompt: ['V'], task: ['V', 'C'],
      episode: ['V'], location: ['V'], voice: ['V'], idea: ['V', 'C'], postit: ['V', 'C'],
      library: ['V'], // ดู Hand/Gesture library ได้ (แก้ไขไม่ได้)
      ai_usage: ['V', 'C'],
      image_request: ['V', 'C'],
    },
  },
  // Creator — ผู้ผลิตงานภาพรวม: สร้างงานได้หลายอย่าง แต่ไม่มีสิทธิ์อนุมัติ (A) / เผยแพร่ (P) / ลบ (X)
  creator: {
    name: 'Creator',
    perms: {
      character: ['V', 'C'], asset: ['V', 'C'], prompt: ['V', 'C'], task: ['V', 'C'],
      product: ['V'], campaign: ['V'], job: ['V', 'C'], episode: ['V', 'C'], location: ['V', 'C'],
      voice: ['V'], content: ['V', 'C'], idea: ['V', 'C'], postit: ['V', 'C'],
      library: ['V', 'C'],
      ai_usage: ['V', 'C'],
      image_request: ['V', 'C'],
    },
  },
  script_writer: {
    name: 'Script Writer',
    perms: {
      character: ['V'], asset: ['V'], prompt: ['V'], task: ['V', 'C'],
      campaign: ['V'], job: ['V'], episode: ['V', 'C'], location: ['V'], content: ['V'],
      library: ['V'],
      competitor: ['V'], idea: ['V', 'C'], postit: ['V', 'C'],
      ai_usage: ['V', 'C'],
      image_request: ['V', 'C'],
    },
  },
  prompt_engineer: {
    name: 'Prompt Engineer',
    perms: {
      character: ['V'], asset: ['V', 'C'], prompt: ['V', 'C', 'A'], task: ['V', 'C'],
      episode: ['V'], performance: ['V'], competitor: ['V'], idea: ['V', 'C'], postit: ['V', 'C'],
      ai_usage: ['V', 'C'],
      image_request: ['V', 'C'],
    },
  },
  ai_video_operator: {
    name: 'AI Video Operator',
    perms: {
      character: ['V'], asset: ['V', 'C'], prompt: ['V'], task: ['V', 'C'],
      episode: ['V', 'C'], location: ['V'], content: ['V'], idea: ['V', 'C'], postit: ['V', 'C'],
      ai_usage: ['V', 'C'],
      image_request: ['V', 'C'],
    },
  },
  video_editor: {
    name: 'Video Editor',
    perms: {
      character: ['V'], asset: ['V', 'C'], prompt: ['V'], task: ['V', 'C'],
      episode: ['V', 'C'], content: ['V'], idea: ['V', 'C'], postit: ['V', 'C'],
      ai_usage: ['V', 'C'],
      image_request: ['V', 'C'],
    },
  },
  content_planner: {
    name: 'Content Planner',
    perms: {
      character: ['V'], asset: ['V'], task: ['V', 'C'],
      product: ['V'], campaign: ['V', 'C'], job: ['V', 'C'], episode: ['V'], content: ['V', 'C', 'P'],
      live: ['V', 'C'], performance: ['V'], competitor: ['V'], idea: ['V', 'C'], postit: ['V', 'C'],
      ai_usage: ['V', 'C'],
      image_request: ['V', 'C'],
    },
  },
  publisher: {
    name: 'Publisher',
    perms: {
      character: ['V'], asset: ['V'], task: ['V', 'C'],
      product: ['V'], episode: ['V'], content: ['V', 'P'], live: ['V', 'P'],
      performance: ['V', 'C'], idea: ['V', 'C'], postit: ['V', 'C'],
      ai_usage: ['V', 'C'],
      image_request: ['V', 'C'],
    },
  },
  commerce_lead: {
    name: 'Commerce Lead',
    perms: {
      character: ['V'], asset: ['V'], task: ['V', 'C'],
      product: ['V', 'C', 'A'], campaign: ['V', 'C', 'A'], job: ['V', 'C', 'A'], content: ['V'],
      live: ['V', 'C', 'A', 'P'], performance: ['V', 'C'], competitor: ['V'],
      rights: ['V'], qc: ['V'], idea: ['V', 'C'], postit: ['V', 'C'],
      ai_usage: ['V', 'C'],
      image_request: ['V', 'C'],
    },
  },
  qc_reviewer: {
    name: 'QC Reviewer',
    perms: {
      character: ['V'], asset: ['V', 'A'], prompt: ['V', 'A'], task: ['V', 'C'],
      product: ['V'], episode: ['V', 'A'], content: ['V', 'A'], live: ['V'],
      rights: ['V'], qc: ['V', 'C', 'A'], idea: ['V', 'C'], postit: ['V', 'C'],
      ai_usage: ['V', 'C'],
      image_request: ['V', 'C', 'A'], // QC มีสิทธิ์อนุมัติงานภาพ (mirror content/asset A)
    },
  },
  researcher: {
    name: 'Researcher',
    perms: {
      character: ['V'], task: ['V', 'C'],
      product: ['V'], campaign: ['V'], job: ['V'], content: ['V'], performance: ['V'],
      competitor: ['V', 'C'], idea: ['V', 'C'], postit: ['V', 'C'],
      ai_usage: ['V', 'C'],
      image_request: ['V', 'C'],
    },
  },
  dev_api: {
    name: 'Dev / API User',
    perms: { character: ['V'], asset: ['V'], prompt: ['V'] },
  },
};

const PLATFORMS = ['grok', 'kling', 'veo', 'midjourney', 'runway', 'sora', 'chatgpt', 'gemini'];

// หมวดหมู่สินค้า builtin — อิงหมวดหลักของ Shopee (เอาเฉพาะหมวดหลัก)
// คีย์เดิม 7 ตัว (fashion/beauty/food/supplement/home/gadget/other) คงไว้เพื่อไม่ให้สินค้าเดิมหลุด
// label ปรับให้ตรงถ้อยคำ Shopee ได้ (label แก้ไขได้), key/builtin นิ่ง (ลบไม่ได้) — เรียงแบบ Shopee, other ท้ายสุด
const BUILTIN_CATEGORIES: { key: string; label: string }[] = [
  { key: 'fashion', label: 'แฟชั่น' },
  { key: 'bags', label: 'กระเป๋า' },
  { key: 'shoes', label: 'รองเท้า' },
  { key: 'accessories', label: 'เครื่องประดับและอัญมณี' },
  { key: 'watches_eyewear', label: 'นาฬิกาและแว่นตา' },
  { key: 'beauty', label: 'ความงาม' },
  { key: 'supplement', label: 'สุขภาพและอาหารเสริม' },
  { key: 'mom_baby', label: 'แม่และเด็ก' },
  { key: 'home', label: 'ของใช้ในบ้าน' },
  { key: 'home_appliances', label: 'เครื่องใช้ไฟฟ้าในบ้าน' },
  { key: 'gadget', label: 'มือถือและแกดเจ็ต' },
  { key: 'computers', label: 'คอมพิวเตอร์และแล็ปท็อป' },
  { key: 'cameras', label: 'กล้องและอุปกรณ์ถ่ายภาพ' },
  { key: 'gaming', label: 'เกมและอุปกรณ์เกม' },
  { key: 'food', label: 'อาหารและเครื่องดื่ม' },
  { key: 'sports_outdoor', label: 'กีฬาและกิจกรรมกลางแจ้ง' },
  { key: 'pets', label: 'สัตว์เลี้ยง' },
  { key: 'automotive', label: 'ยานยนต์' },
  { key: 'tools_home_improvement', label: 'เครื่องมือช่างและปรับปรุงบ้าน' },
  { key: 'books_stationery', label: 'หนังสือและเครื่องเขียน' },
  { key: 'toys_hobbies', label: 'ของเล่นและงานอดิเรก' },
  { key: 'travel_luggage', label: 'การเดินทางและกระเป๋าเดินทาง' },
  { key: 'other', label: 'อื่นๆ' },
];

// สถานะสินค้า (ProductState) builtin — วงจรมาตรฐาน: ยังไม่แกะ → แกะ → เปิดฝา → กำลังใช้ → ...
// key/builtin นิ่ง (ลบไม่ได้), label แก้ได้ภายหลัง — ใช้เป็น reference data ของ interaction library
const BUILTIN_PRODUCT_STATES: {
  key: string;
  label: string;
  isInitial?: boolean;
  isTerminal?: boolean;
}[] = [
  { key: 'sealed', label: 'ยังไม่แกะ (ซีล)', isInitial: true },
  { key: 'opened', label: 'แกะแล้ว' },
  { key: 'cap_removed', label: 'เปิดฝา/ถอดจุก' },
  { key: 'in_use', label: 'กำลังใช้งาน' },
  { key: 'partially_used', label: 'ใช้ไปบางส่วน' },
  { key: 'result', label: 'ผลลัพธ์', isTerminal: true },
  { key: 'empty', label: 'หมด/ว่างเปล่า', isTerminal: true },
];

// เส้นทางการเปลี่ยนสถานะ builtin (from key → to key)
const BUILTIN_TRANSITIONS: { from: string; to: string }[] = [
  { from: 'sealed', to: 'opened' },
  { from: 'opened', to: 'cap_removed' },
  { from: 'cap_removed', to: 'in_use' },
  { from: 'in_use', to: 'partially_used' },
  { from: 'in_use', to: 'result' },
  { from: 'partially_used', to: 'result' },
  { from: 'result', to: 'empty' },
];

// ── Camera Library builtin (SRS §3.6) — reference มุมกล้อง (upsert on key, ไม่ทับ user edit) ──
type CameraSeed = {
  key: string;
  name: string;
  description?: string;
  shotSize?: string;
  angle?: string;
  lens?: string;
  focalLength?: string;
  cameraMovement?: string;
  movementSpeed?: string;
  focusTarget?: string;
  depthOfField?: string;
  aspectRatio?: string;
  productVisibility?: string;
  handVisibility?: string;
  compatiblePackaging?: string[];
  promptTemplate?: string;
  negativePrompt?: string;
};

const BUILTIN_CAMERAS: CameraSeed[] = [
  { key: 'front', name: 'มุมหน้าตรง (Front)', shotSize: 'medium', angle: 'front', cameraMovement: 'static', focusTarget: 'product', productVisibility: 'hero', promptTemplate: 'front-facing eye-level shot, product centered and facing camera' },
  { key: 'top_view', name: 'มุมบน (Top view / Flat lay)', shotSize: 'medium', angle: 'top', cameraMovement: 'static', focusTarget: 'product', promptTemplate: 'top-down flat lay, product laid on surface, symmetrical composition' },
  { key: '45deg', name: 'มุม 45 องศา', shotSize: 'medium', angle: '45deg', cameraMovement: 'static', focusTarget: 'product', promptTemplate: 'three-quarter 45-degree angle, showing depth and label' },
  { key: 'side', name: 'มุมข้าง (Side profile)', shotSize: 'medium', angle: 'side', cameraMovement: 'static', focusTarget: 'product', promptTemplate: 'side profile shot, clean silhouette of the product' },
  { key: 'macro', name: 'มาโคร (Macro close-up)', description: 'โคลสอัปพื้นผิว/ดีเทลระยะใกล้มาก', shotSize: 'extreme_closeup', angle: 'front', lens: 'macro', focalLength: '100mm', cameraMovement: 'static', focusTarget: 'label', depthOfField: 'shallow', productVisibility: 'hero', promptTemplate: 'extreme macro close-up, fine texture detail, shallow depth of field', negativePrompt: 'no motion blur, no soft focus on subject' },
  { key: 'extreme_closeup', name: 'โคลสอัปสุด (Extreme close-up)', shotSize: 'extreme_closeup', angle: 'front', cameraMovement: 'static', focusTarget: 'label', depthOfField: 'shallow', promptTemplate: 'extreme close-up filling the frame, crisp detail' },
  { key: 'pov', name: 'มุมมองบุคคลที่ 1 (POV)', shotSize: 'medium', angle: 'pov', cameraMovement: 'handheld', focusTarget: 'hand', handVisibility: 'required', promptTemplate: 'first-person POV, hands entering frame using the product naturally' },
  { key: 'over_shoulder', name: 'มุมข้ามไหล่ (Over-the-shoulder)', shotSize: 'medium', angle: 'over_shoulder', cameraMovement: 'static', focusTarget: 'product', handVisibility: 'optional', promptTemplate: 'over-the-shoulder view looking down at the product in use' },
  { key: 'wide', name: 'มุมกว้าง (Wide)', shotSize: 'wide', angle: 'front', cameraMovement: 'static', focusTarget: 'product', promptTemplate: 'wide establishing shot, product within its environment' },
  { key: 'medium', name: 'มุมกลาง (Medium)', shotSize: 'medium', angle: 'front', cameraMovement: 'static', focusTarget: 'product', promptTemplate: 'medium shot, product and hands in frame' },
  { key: 'closeup', name: 'โคลสอัป (Close-up)', shotSize: 'closeup', angle: 'front', cameraMovement: 'static', focusTarget: 'product', depthOfField: 'shallow', promptTemplate: 'close-up shot, product prominent and sharp' },
  { key: 'beauty_shot', name: 'บิวตี้ช็อต (Beauty shot)', description: 'ช็อตอวดสินค้าให้ดูพรีเมียม', shotSize: 'closeup', angle: '45deg', cameraMovement: 'orbit', movementSpeed: 'slow', focusTarget: 'product', depthOfField: 'shallow', productVisibility: 'hero', promptTemplate: 'glamour beauty shot, slow orbit, glossy highlights, premium look' },
  { key: 'product_hero', name: 'ฮีโร่โปรดักต์ (Product hero)', description: 'พระเอกของเฟรม สินค้าเด่นสุด', shotSize: 'medium', angle: 'front', cameraMovement: 'static', focusTarget: 'product', productVisibility: 'hero', aspectRatio: '9:16', promptTemplate: 'hero product shot, product dominant and perfectly lit, clean background', negativePrompt: 'no clutter, no competing objects' },
  { key: 'orbit', name: 'ออร์บิท (Orbit / หมุนรอบ)', shotSize: 'medium', angle: 'front', cameraMovement: 'orbit', movementSpeed: 'medium', focusTarget: 'product', promptTemplate: 'smooth 360 orbit around the product' },
  { key: 'tracking', name: 'แทร็กกิ้ง (Tracking)', shotSize: 'medium', angle: 'front', cameraMovement: 'tracking', movementSpeed: 'medium', focusTarget: 'product', promptTemplate: 'tracking shot following the action smoothly' },
  { key: 'handheld', name: 'แฮนด์เฮลด์ (Handheld)', shotSize: 'medium', angle: 'front', cameraMovement: 'handheld', movementSpeed: 'medium', focusTarget: 'product', promptTemplate: 'natural handheld movement, authentic UGC feel' },
  { key: 'static', name: 'กล้องนิ่ง (Static / Locked)', shotSize: 'medium', angle: 'front', cameraMovement: 'static', focusTarget: 'product', promptTemplate: 'locked-off static camera, stable framing' },
  { key: 'slider', name: 'สไลเดอร์ (Slider)', shotSize: 'medium', angle: 'front', cameraMovement: 'slider', movementSpeed: 'slow', focusTarget: 'product', promptTemplate: 'slow slider push-in revealing the product' },
];

// ── Lighting Library builtin (SRS §3.7) — reference แสง (upsert on key) ──
type LightingSeed = {
  key: string;
  name: string;
  description?: string;
  keyLight?: string;
  fillLight?: string;
  backLight?: string;
  colorTemperature?: string;
  contrast?: string;
  shadowLevel?: string;
  highlightControl?: string;
  reflectiveProductRule?: string;
  transparentProductRule?: string;
  skinToneCompatibility?: string[];
  backgroundCompatibility?: string[];
  mood?: string;
  promptTemplate?: string;
  negativePrompt?: string;
};

const BUILTIN_LIGHTINGS: LightingSeed[] = [
  { key: 'soft_studio', name: 'สตูดิโอนุ่ม (Soft studio)', keyLight: 'large softbox', fillLight: 'bounce', backLight: 'subtle rim', colorTemperature: '5600K', contrast: 'low', shadowLevel: 'soft', mood: 'soft', reflectiveProductRule: 'ใช้ softbox ใหญ่ + กระจายแสงเพื่อลดจุดสะท้อนแข็งบนผิวมันวาว', promptTemplate: 'soft even studio lighting, gentle shadows, clean product presentation' },
  { key: 'natural_daylight', name: 'แสงธรรมชาติ (Natural daylight)', keyLight: 'window light', fillLight: 'ambient bounce', colorTemperature: '5200K', contrast: 'medium', shadowLevel: 'soft', mood: 'natural', backgroundCompatibility: ['home', 'wooden_table'], promptTemplate: 'natural window daylight, airy and fresh, realistic ambience' },
  { key: 'golden_hour', name: 'โกลเดนอาวร์ (Golden hour)', keyLight: 'warm sun low angle', backLight: 'warm rim', colorTemperature: 'warm', contrast: 'medium', mood: 'warm', promptTemplate: 'golden hour warm sunlight, long soft shadows, cozy glow' },
  { key: 'kitchen', name: 'ครัว (Kitchen)', keyLight: 'overhead + window', fillLight: 'bounce', colorTemperature: 'mixed', contrast: 'medium', mood: 'natural', backgroundCompatibility: ['kitchen'], promptTemplate: 'bright clean kitchen lighting, appetizing and hygienic' },
  { key: 'bathroom', name: 'ห้องน้ำ (Bathroom)', keyLight: 'diffused overhead', colorTemperature: 'cool', contrast: 'low', mood: 'clinical', backgroundCompatibility: ['bathroom'], reflectiveProductRule: 'ระวังแสงสะท้อนจากกระเบื้อง/กระจก — ใช้ diffuser', promptTemplate: 'clean cool bathroom lighting, fresh and hygienic feel' },
  { key: 'office', name: 'ออฟฟิศ (Office)', keyLight: 'panel light', colorTemperature: '4500K', contrast: 'low', mood: 'clinical', backgroundCompatibility: ['office'], promptTemplate: 'neutral office lighting, professional and even' },
  { key: 'luxury', name: 'ลักชัวรี (Luxury)', keyLight: 'focused key', backLight: 'strong rim', colorTemperature: 'warm', contrast: 'high', shadowLevel: 'deep', mood: 'luxury', reflectiveProductRule: 'ใช้ rim light เน้นขอบโลหะ/แก้วให้ดูพรีเมียม โดยควบคุม hotspot', promptTemplate: 'dramatic luxury lighting, deep shadows, elegant rim highlights, premium mood' },
  { key: 'beauty', name: 'บิวตี้ (Beauty)', keyLight: 'ring/beauty dish', fillLight: 'clamshell fill', colorTemperature: '5600K', contrast: 'low', shadowLevel: 'soft', mood: 'soft', skinToneCompatibility: ['fair', 'olive', 'tan', 'deep'], promptTemplate: 'flattering beauty lighting, clamshell setup, smooth skin, catchlights' },
  { key: 'dark_mood', name: 'โทนมืด (Dark mood)', keyLight: 'single hard key', colorTemperature: 'cool', contrast: 'high', shadowLevel: 'deep', mood: 'dramatic', promptTemplate: 'low-key dark moody lighting, single light source, strong contrast', negativePrompt: 'no flat lighting, no overexposure' },
  { key: 'neon', name: 'นีออน (Neon)', keyLight: 'colored neon', backLight: 'magenta/cyan rim', colorTemperature: 'mixed', contrast: 'high', mood: 'neon', promptTemplate: 'vibrant neon lighting, magenta and cyan glow, night club vibe' },
  { key: 'outdoor', name: 'กลางแจ้ง (Outdoor)', keyLight: 'open sky', fillLight: 'ambient', colorTemperature: '6000K', contrast: 'medium', mood: 'natural', backgroundCompatibility: ['outdoor'], promptTemplate: 'bright outdoor daylight, natural sky illumination' },
  { key: 'marketplace', name: 'มาร์เก็ตเพลส (Marketplace)', keyLight: 'flat frontal', fillLight: 'even', colorTemperature: '5600K', contrast: 'low', shadowLevel: 'soft', mood: 'clinical', backgroundCompatibility: ['white', 'seamless'], promptTemplate: 'flat even e-commerce lighting, pure white background, catalog ready', negativePrompt: 'no harsh shadows, no color cast' },
  { key: 'clinical', name: 'คลินิก (Clinical)', keyLight: 'diffused daylight', colorTemperature: 'cool', contrast: 'low', shadowLevel: 'soft', mood: 'clinical', transparentProductRule: 'จัด backlight อ่อน ๆ ให้เห็นเนื้อของเหลวใส/เซรั่มโปร่งแสง', promptTemplate: 'clean clinical lighting, sterile and trustworthy, medical grade feel' },
  { key: 'warm_home', name: 'บ้านอบอุ่น (Warm home)', keyLight: 'warm lamp', fillLight: 'ambient', colorTemperature: 'warm', contrast: 'medium', mood: 'warm', backgroundCompatibility: ['home'], promptTemplate: 'warm cozy home lighting, inviting domestic atmosphere' },
  { key: 'food_photography', name: 'ถ่ายอาหาร (Food photography)', keyLight: 'side softbox', fillLight: 'bounce card', backLight: 'rim', colorTemperature: '5200K', contrast: 'medium', mood: 'natural', transparentProductRule: 'backlight เน้นความฉ่ำ/เนื้อสัมผัสของของเหลว', promptTemplate: 'appetizing food photography lighting, side light for texture, fresh look' },
  { key: 'product_packshot', name: 'แพ็กช็อตสินค้า (Product packshot)', keyLight: 'softbox key', fillLight: 'fill card', backLight: 'gradient sweep', colorTemperature: '5600K', contrast: 'medium', shadowLevel: 'soft', mood: 'soft', reflectiveProductRule: 'ใช้ light tent/สวีปเพื่อคุมแสงสะท้อนบนพื้นผิวมันวาว', transparentProductRule: 'backlight/gradient sweep ให้ขอบสินค้าใสอ่านออก', promptTemplate: 'professional packshot lighting, gradient sweep, controlled reflections, clean edges', negativePrompt: 'no blown highlights, no distracting reflections' },
];

// ── Character Blueprint (พิมพ์เขียว) builtin — "creation directive" ที่ CEO แก้ได้ ──
// คุมมาตรฐานการสร้างตัวละคร (AI Wizard + Reverse-capture): house-rules + defaults + required-field checks
const BUILTIN_BLUEPRINTS: {
  name: string;
  description: string;
  icon: string;
  houseRules: string;
  requiredFields: string[];
  defaults: Record<string, unknown>;
  isDefault: boolean;
  sortOrder: number;
}[] = [
  {
    name: 'มาตรฐานทั่วไป',
    description: 'พิมพ์เขียวกลางสำหรับตัวละครไทยทั่วไป — ภาพ photorealistic แนวตั้ง 3:4',
    icon: '⭐',
    houseRules:
      'ตัวละครต้องเป็นคนไทย/เอเชียตะวันออกเฉียงใต้ ดูเป็นธรรมชาติ น่าเชื่อถือ เหมาะกับคอนเทนต์ commerce ในไทย. เน้นความ original ไม่ซ้ำใคร ไม่อ้างอิงบุคคลจริง.',
    requiredFields: ['ethnicity'],
    defaults: {
      ethnicity: 'ไทย, ลักษณะเอเชียตะวันออกเฉียงใต้ (Thai, Southeast Asian features)',
      art_style: 'photorealistic',
      aspect_ratio: '3:4',
      shot_type: 'portrait',
    },
    isDefault: true,
    sortOrder: 0,
  },
  {
    name: 'แม่บ้านอีสาน',
    description: 'แม่บ้านสายอีสาน อบอุ่นจริงใจ เหมาะรีวิวของกิน/ของใช้ในบ้าน',
    icon: '🏠',
    houseRules:
      'ตัวละครเป็นแม่บ้านคนอีสาน บุคลิกอบอุ่น เป็นกันเอง พูดจริงใจแบบคนบ้านนอก. โทนภาพอุ่นแบบบ้าน มีกลิ่นอายวิถีชีวิตอีสาน. ห้ามทำให้ดูเป็นการล้อเลียนหรือดูถูกภูมิภาค — ต้องให้เกียรติและสมจริง.',
    requiredFields: ['ethnicity', 'distinctive_features'],
    defaults: {
      ethnicity: 'ไทย, ลักษณะคนอีสาน (Thai, Isan features)',
      region: 'ภาคอีสาน',
      age_range: '30-45',
      lighting: 'warm home lighting',
      art_style: 'photorealistic',
      aspect_ratio: '3:4',
    },
    isDefault: false,
    sortOrder: 1,
  },
  {
    name: 'Beauty Presenter',
    description: 'พรีเซนเตอร์สายบิวตี้ ผิวสวย แสงสตูดิโอนุ่ม เหมาะรีวิวสกินแคร์/เครื่องสำอาง',
    icon: '💄',
    houseRules:
      'ตัวละครเป็นพรีเซนเตอร์สายความงาม ดูแลตัวเองดี ผิวพรรณสุขภาพดีแต่สมจริง (ไม่รีทัชจนเกินจริง). โทนการขายต้องจริงใจ ห้ามเคลมสรรพคุณเกินจริงเรื่องผิว/ความงาม.',
    requiredFields: ['ethnicity', 'skin_tone'],
    defaults: {
      ethnicity: 'ไทย, ลักษณะเอเชียตะวันออกเฉียงใต้ (Thai, Southeast Asian features)',
      art_style: 'photorealistic',
      lighting: 'soft studio lighting',
      aspect_ratio: '3:4',
      mood: 'clean beauty',
    },
    isDefault: false,
    sortOrder: 2,
  },
  {
    name: 'Gen-Z Reviewer',
    description: 'รีวิวเวอร์วัย Gen-Z สดใส มีพลัง เหมาะคอนเทนต์ไวรัลบน TikTok',
    icon: '⚡',
    houseRules:
      'ตัวละครเป็นรีวิวเวอร์วัย Gen-Z พลังงานสูง สดใส ทันเทรนด์ พูดภาษาวัยรุ่นแต่ไม่หยาบ. โทนภาพสดใสมีสีสัน เหมาะกับ short-form video. อายุต้อง >= 18 เสมอ.',
    requiredFields: ['ethnicity'],
    defaults: {
      ethnicity: 'ไทย, ลักษณะเอเชียตะวันออกเฉียงใต้ (Thai, Southeast Asian features)',
      age_range: '18-25',
      art_style: 'photorealistic',
      aspect_ratio: '3:4',
      mood: 'vibrant',
    },
    isDefault: false,
    sortOrder: 3,
  },
];

// ── Banned Words Compliance builtin — คำต้องห้าม social commerce ไทย (~50 คำ) ──
// severity: ban = โดนแบน/ลบคลิป (HARD BLOCK ตอน Clip Job → ready/published) | risky = ลดการมองเห็น (เตือน)
// platforms ว่าง = ทุกแพลตฟอร์ม — upsert on term: update เฉพาะ {builtin:true} ไม่ทับที่ user แก้เอง
const BUILTIN_BANNED_WORDS: {
  term: string;
  severity: 'ban' | 'risky';
  category: string;
  replacement?: string;
  platforms?: string[];
  note?: string;
}[] = [
  // health claims — เคลมทางการแพทย์ (อย. + ทุกแพลตฟอร์มแบนหนัก)
  { term: 'รักษา', severity: 'ban', category: 'health_claim', replacement: 'ดูแล' },
  { term: 'หายขาด', severity: 'ban', category: 'health_claim', replacement: 'ช่วยให้ดีขึ้น' },
  { term: 'หายทันที', severity: 'ban', category: 'health_claim', replacement: 'เห็นการเปลี่ยนแปลง' },
  { term: 'บำบัด', severity: 'ban', category: 'health_claim', replacement: 'ดูแล' },
  { term: 'ยับยั้งมะเร็ง', severity: 'ban', category: 'health_claim' },
  { term: 'ต้านมะเร็ง', severity: 'ban', category: 'health_claim' },
  { term: 'ฆ่าเชื้อ', severity: 'ban', category: 'health_claim', replacement: 'ลดการสะสมของแบคทีเรีย' },
  { term: 'ต้านไวรัส', severity: 'ban', category: 'health_claim' },
  { term: 'เบาหวานหาย', severity: 'ban', category: 'health_claim' },
  { term: 'ลดความดัน', severity: 'ban', category: 'health_claim' },
  { term: 'สลายไขมัน', severity: 'ban', category: 'health_claim', replacement: 'ดูแลรูปร่าง' },
  { term: 'แก้ภูมิแพ้', severity: 'ban', category: 'health_claim' },
  { term: 'ลดคอเลสเตอรอล', severity: 'ban', category: 'health_claim' },
  // beauty claims — เคลมความงามเกินจริง
  { term: 'ขาวขึ้นทันที', severity: 'ban', category: 'beauty_claim', replacement: 'กระจ่างใสขึ้น' },
  { term: 'หน้าเด็ก', severity: 'risky', category: 'beauty_claim', replacement: 'ผิวดูอ่อนเยาว์' },
  { term: 'ลดริ้วรอย 100%', severity: 'ban', category: 'beauty_claim', replacement: 'ริ้วรอยดูจางลง' },
  { term: 'ฟอกขาว', severity: 'ban', category: 'beauty_claim' },
  { term: 'ไร้ผลข้างเคียง', severity: 'ban', category: 'beauty_claim' },
  { term: 'ปลอดภัย 100%', severity: 'ban', category: 'beauty_claim', replacement: 'อ่อนโยนต่อผิว' },
  { term: 'ผิวขาวถาวร', severity: 'ban', category: 'beauty_claim' },
  { term: 'ผิวขาวใน 3 วัน', severity: 'ban', category: 'beauty_claim' },
  { term: 'หน้าใสไร้สิว', severity: 'risky', category: 'beauty_claim', replacement: 'ดูแลผิวเป็นสิว' },
  // superlatives — คำเว่อร์/อวดอ้าง (ส่วนใหญ่ = ลดการมองเห็น, การันตีผล = แบน)
  { term: 'ที่สุด', severity: 'risky', category: 'superlative', replacement: 'ตัวโปรด', platforms: ['tiktok'], note: 'TikTok Shop ห้ามคำ superlative — แพลตฟอร์มอื่นยังพอไหว' },
  { term: 'ดีที่สุด', severity: 'risky', category: 'superlative', replacement: 'ถูกใจสุด ๆ', platforms: ['tiktok'] },
  { term: 'อันดับ 1', severity: 'risky', category: 'superlative' },
  { term: 'เจ้าแรก', severity: 'risky', category: 'superlative' },
  { term: 'เจ้าเดียว', severity: 'risky', category: 'superlative' },
  { term: 'การันตีผล', severity: 'ban', category: 'superlative', replacement: 'ผู้ใช้จริงรีวิว' },
  { term: 'เห็นผล 100%', severity: 'ban', category: 'superlative', replacement: 'ผลลัพธ์ขึ้นกับแต่ละบุคคล' },
  { term: 'ถาวร', severity: 'risky', category: 'superlative', replacement: 'ยาวนาน' },
  { term: 'ดีกว่าทุกยี่ห้อ', severity: 'risky', category: 'superlative' },
  // weight loss — ลดน้ำหนัก (สายแบนหนักทุกแพลตฟอร์ม)
  { term: 'ผอมเร็ว', severity: 'ban', category: 'weight_loss' },
  { term: 'ไม่ต้องออกกำลังกาย', severity: 'ban', category: 'weight_loss' },
  { term: 'บล็อกแป้ง', severity: 'ban', category: 'weight_loss' },
  { term: 'ดักไขมัน', severity: 'ban', category: 'weight_loss' },
  { term: 'ลดน้ำหนักได้จริง', severity: 'ban', category: 'weight_loss' },
  { term: 'หุ่นดีใน 7 วัน', severity: 'ban', category: 'weight_loss' },
  { term: 'ไม่โยโย่', severity: 'risky', category: 'weight_loss' },
  // finance — การเงินหลอกลวง/ชวนเชื่อ
  { term: 'รวยเร็ว', severity: 'ban', category: 'finance' },
  { term: 'เงินง่าย', severity: 'ban', category: 'finance' },
  { term: 'รายได้การันตี', severity: 'ban', category: 'finance' },
  { term: 'กู้เงินด่วน', severity: 'ban', category: 'finance' },
  // gambling — การพนัน (แบนทุกแพลตฟอร์ม)
  { term: 'พนัน', severity: 'ban', category: 'gambling' },
  { term: 'บาคาร่า', severity: 'ban', category: 'gambling' },
  { term: 'หวย', severity: 'ban', category: 'gambling' },
  { term: 'เว็บตรง', severity: 'ban', category: 'gambling' },
  { term: 'สล็อต', severity: 'ban', category: 'gambling' },
  // medical terms — คำทางการแพทย์/อ้างอิงราชการ
  { term: 'อย. รับรอง', severity: 'risky', category: 'medical', note: 'ใช้ได้เฉพาะเมื่อมีเลข อย. จริงและตรวจสอบได้ — ห้ามอ้างลอย ๆ เด็ดขาด' },
  { term: 'สเตียรอยด์', severity: 'ban', category: 'medical' },
  { term: 'ยาลดความอ้วน', severity: 'ban', category: 'medical' },
];

async function main() {
  for (const [key, def] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { key },
      update: { name: def.name },
      create: { key, name: def.name },
    });
    for (const [module, actions] of Object.entries(def.perms)) {
      await prisma.rolePermission.upsert({
        where: { roleId_module: { roleId: role.id, module } },
        update: { actions },
        create: { roleId: role.id, module, actions },
      });
    }
  }

  for (const key of PLATFORMS) {
    await prisma.platform.upsert({
      where: { key },
      update: {},
      create: { key, name: key.charAt(0).toUpperCase() + key.slice(1) },
    });
  }

  // builtin product categories — อิงหมวดหลัก Shopee; key/builtin นิ่ง (ลบไม่ได้)
  // ตั้งใจ sync label + sortOrder ให้ตรง canonical Shopee ทุกครั้ง (ถ้า user rename เอง จะถูก reset ตอน re-seed)
  for (let i = 0; i < BUILTIN_CATEGORIES.length; i++) {
    const { key, label } = BUILTIN_CATEGORIES[i];
    await prisma.productCategory.upsert({
      where: { key },
      update: { label, sortOrder: i, builtin: true },
      create: { key, label, sortOrder: i, builtin: true },
    });
  }

  // builtin product states + transitions — reference data ของ Product Interaction Library
  // idempotent (upsert on key) — key/builtin นิ่ง, label/isInitial/isTerminal ปล่อยให้แก้ได้
  const stateIdByKey = new Map<string, string>();
  for (let i = 0; i < BUILTIN_PRODUCT_STATES.length; i++) {
    const s = BUILTIN_PRODUCT_STATES[i];
    const state = await prisma.productState.upsert({
      where: { key: s.key },
      update: { builtin: true },
      create: {
        key: s.key,
        label: s.label,
        sortOrder: i,
        isInitial: s.isInitial ?? false,
        isTerminal: s.isTerminal ?? false,
        builtin: true,
      },
    });
    stateIdByKey.set(s.key, state.id);
  }
  for (const t of BUILTIN_TRANSITIONS) {
    const fromId = stateIdByKey.get(t.from);
    const toId = stateIdByKey.get(t.to);
    if (!fromId || !toId) continue;
    await prisma.productStateTransition.upsert({
      where: { fromStateId_toStateId: { fromStateId: fromId, toStateId: toId } },
      update: {},
      create: { fromStateId: fromId, toStateId: toId },
    });
  }

  const adminEmail = 'admin@aistar.local';
  const adminPassword = 'aistar-admin-2026';
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      name: 'AISTAR Admin',
    },
  });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: 'admin' } });
  await prisma.roleAssignment.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  // ── Camera & Lighting Library builtin (SRS slice 3) — reference data ──
  // idempotent (upsert on key): create ครั้งแรกพร้อม metadata, ไม่ทับ user edit ตอน re-seed (update: {})
  let cameraCreated = 0;
  for (const c of BUILTIN_CAMERAS) {
    const before = await prisma.cameraPreset.findUnique({ where: { key: c.key }, select: { id: true } });
    // displayCode จาก count ปัจจุบัน (กันชนกับ preset ที่ user สร้างเองก่อน re-seed)
    const camCount = await prisma.cameraPreset.count();
    await prisma.cameraPreset.upsert({
      where: { key: c.key },
      update: {},
      create: {
        displayCode: `CAM-${String(camCount + 1).padStart(4, '0')}`,
        key: c.key,
        name: c.name,
        description: c.description,
        shotSize: c.shotSize,
        angle: c.angle,
        lens: c.lens,
        focalLength: c.focalLength,
        cameraMovement: c.cameraMovement,
        movementSpeed: c.movementSpeed,
        focusTarget: c.focusTarget,
        depthOfField: c.depthOfField,
        aspectRatio: c.aspectRatio,
        productVisibility: c.productVisibility,
        handVisibility: c.handVisibility,
        compatiblePackaging: c.compatiblePackaging ?? [],
        promptTemplate: c.promptTemplate,
        negativePrompt: c.negativePrompt,
        createdBy: admin.id,
      },
    });
    if (!before) cameraCreated++;
  }

  let lightingCreated = 0;
  for (const l of BUILTIN_LIGHTINGS) {
    const before = await prisma.lightingPreset.findUnique({ where: { key: l.key }, select: { id: true } });
    const litCount = await prisma.lightingPreset.count();
    await prisma.lightingPreset.upsert({
      where: { key: l.key },
      update: {},
      create: {
        displayCode: `LIGHT-${String(litCount + 1).padStart(4, '0')}`,
        key: l.key,
        name: l.name,
        description: l.description,
        keyLight: l.keyLight,
        fillLight: l.fillLight,
        backLight: l.backLight,
        colorTemperature: l.colorTemperature,
        contrast: l.contrast,
        shadowLevel: l.shadowLevel,
        highlightControl: l.highlightControl,
        reflectiveProductRule: l.reflectiveProductRule,
        transparentProductRule: l.transparentProductRule,
        skinToneCompatibility: l.skinToneCompatibility ?? [],
        backgroundCompatibility: l.backgroundCompatibility ?? [],
        mood: l.mood,
        promptTemplate: l.promptTemplate,
        negativePrompt: l.negativePrompt,
        createdBy: admin.id,
      },
    });
    if (!before) lightingCreated++;
  }

  // ── Demo clients + jobs (idempotent) — สำหรับ demo โมดูล Jobs ให้ CEO ──
  const demoClients: { key: string; name: string; type: string; contactName?: string; line?: string }[] = [
    { key: 'demo-client-glow', name: 'GlowUp Cosmetics', type: 'brand', contactName: 'คุณมิ้นต์', line: '@glowup' },
    { key: 'demo-client-agency', name: 'Spark Digital Agency', type: 'agency', contactName: 'คุณโบ๊ท', line: '@sparkdigital' },
  ];
  const clientIdByKey = new Map<string, string>();
  for (const c of demoClients) {
    // ใช้ notes เก็บ seed key เพื่อ idempotent (Client ไม่มี unique field อื่นนอก id)
    const existing = await prisma.client.findFirst({ where: { notes: `seed:${c.key}` } });
    const client = existing
      ? existing
      : await prisma.client.create({
          data: {
            name: c.name,
            type: c.type,
            contactName: c.contactName,
            line: c.line,
            notes: `seed:${c.key}`,
          },
        });
    clientIdByKey.set(c.key, client.id);
  }

  const demoJobs: {
    code: string;
    title: string;
    clientKey: string;
    type: 'image_pack' | 'video_review' | 'live' | 'mixed';
    status:
      | 'inquiry'
      | 'quoted'
      | 'confirmed'
      | 'in_production'
      | 'internal_qc'
      | 'delivered'
      | 'approved';
    qtyImages?: number;
    qtyClips?: number;
    quotePrice?: number;
  }[] = [
    { code: 'JOB-0001', title: 'รีวิวเซรั่ม GlowUp 3 คลิป', clientKey: 'demo-client-glow', type: 'video_review', status: 'in_production', qtyClips: 3, quotePrice: 25000 },
    { code: 'JOB-0002', title: 'ภาพโปรโมทเซ็ตของขวัญ', clientKey: 'demo-client-glow', type: 'image_pack', status: 'quoted', qtyImages: 10, quotePrice: 12000 },
    { code: 'JOB-0003', title: 'Live ขายสินค้า Spark x Shopee', clientKey: 'demo-client-agency', type: 'live', status: 'confirmed', quotePrice: 40000 },
  ];
  for (const j of demoJobs) {
    const clientId = clientIdByKey.get(j.clientKey);
    if (!clientId) continue;
    await prisma.job.upsert({
      where: { displayCode: j.code },
      update: {},
      create: {
        displayCode: j.code,
        title: j.title,
        clientId,
        type: j.type,
        status: j.status,
        qtyImages: j.qtyImages,
        qtyClips: j.qtyClips,
        quotePrice: j.quotePrice,
        createdBy: admin.id,
        ownerId: admin.id,
      },
    });
  }

  // ── ตัวอย่างกลุ่มผู้ชม (Audience Segment) — โฟกัสตลาดไทย, idempotent by name ──
  const THAI_AUDIENCE_SEGMENTS = [
    {
      name: 'สาวออฟฟิศสายมู 25-35',
      description: 'มนุษย์เงินเดือนหญิงในเมือง เครียดงาน มองหาที่พึ่งทางใจและของเสริมดวง',
      ageMin: 25, ageMax: 35, gender: 'female',
      interests: ['มูเตลู', 'ดูดวง', 'บิวตี้', 'ช้อปปิ้งออนไลน์', 'คาเฟ่'],
      platforms: ['TikTok', 'Facebook'], spendingPower: 'medium', region: 'กรุงเทพฯ/เมืองใหญ่',
      painPoint: 'เครียดงาน อยากได้ที่พึ่งทางใจ + ของที่ช่วยเรื่องดวง/โชคลาภ',
    },
    {
      name: 'วัยรุ่น Gen Z สายบิวตี้ 16-24',
      description: 'นักเรียน/นักศึกษาหญิง ตามเทรนด์เมคอัพ-สกินแคร์ งบจำกัดแต่อยากสวยตามกระแส',
      ageMin: 16, ageMax: 24, gender: 'female',
      interests: ['เมคอัพ', 'สกินแคร์', 'K-beauty', 'แฟชั่น', 'ไอดอล'],
      platforms: ['TikTok', 'Instagram'], spendingPower: 'low', region: 'ทั่วประเทศ',
      painPoint: 'งบน้อยแต่อยากได้ผลลัพธ์จริง ต้องเห็นรีวิว before/after',
    },
    {
      name: 'แม่บ้านสายช้อปไลฟ์ 30-45',
      description: 'แม่บ้าน/คุณแม่ ดูไลฟ์ขายของ ตัดสินใจซื้อของใช้ในบ้านและของลูก',
      ageMin: 30, ageMax: 45, gender: 'female',
      interests: ['ของใช้ในบ้าน', 'สินค้าเด็ก', 'อาหาร', 'โปรโมชั่น', 'สุขภาพครอบครัว'],
      platforms: ['Facebook', 'TikTok', 'Shopee Live'], spendingPower: 'medium', region: 'ปริมณฑล/ต่างจังหวัด',
      painPoint: 'อยากได้ของถูกและคุ้ม ดูรีวิว+โปรก่อนกดซื้อ',
    },
    {
      name: 'หนุ่มสายเทค/เกม/แกดเจ็ต 18-30',
      description: 'ผู้ชายสายไอที เล่นเกม ตามรีวิวแกดเจ็ต เน้นสเปกและความคุ้มค่า',
      ageMin: 18, ageMax: 30, gender: 'male',
      interests: ['เกม', 'แกดเจ็ต', 'เทคโนโลยี', 'รีวิวไอที', 'อีสปอร์ต'],
      platforms: ['YouTube', 'TikTok', 'Facebook'], spendingPower: 'high', region: 'ทั่วประเทศ',
      painPoint: 'อยากรู้สเปก/รีวิวจริงและเทียบราคาก่อนตัดสินใจ',
    },
    {
      name: 'สายกิน/รีวิวอาหาร 20-40',
      description: 'กลุ่มชอบกิน ตามคาเฟ่-ร้านเด็ด สั่งเดลิเวอรีบ่อย',
      ageMin: 20, ageMax: 40, gender: 'mixed',
      interests: ['อาหาร', 'คาเฟ่', 'ของกินเล่น', 'เดลิเวอรี', 'ท่องเที่ยว'],
      platforms: ['TikTok', 'Instagram', 'Facebook'], spendingPower: 'medium', region: 'เมืองใหญ่',
      painPoint: 'อยากเห็นของจริง/รสชาติจริงก่อนไปหรือสั่ง',
    },
    {
      name: 'สายสุขภาพ/ออกกำลังกาย 25-40',
      description: 'คนรักสุขภาพ ออกกำลังกาย กินคลีน สนใจอาหารเสริม',
      ageMin: 25, ageMax: 40, gender: 'mixed',
      interests: ['ฟิตเนส', 'อาหารเสริม', 'กินคลีน', 'สุขภาพ', 'โยคะ'],
      platforms: ['Instagram', 'TikTok', 'YouTube'], spendingPower: 'high', region: 'เมืองใหญ่',
      painPoint: 'ต้องการข้อมูล/งานวิจัยรองรับ กลัวของปลอม/เคลมเกินจริง',
    },
    {
      name: 'วัยเก๋าสายสุขภาพ 45-60',
      description: 'ผู้ใหญ่/ผู้สูงวัย ห่วงสุขภาพ ชอบสมุนไพร-ธรรมะ ดูรีวิวจากคนวัยเดียวกัน',
      ageMin: 45, ageMax: 60, gender: 'mixed',
      interests: ['สุขภาพ', 'สมุนไพร', 'ธรรมะ', 'ครอบครัว', 'ข่าวสาร'],
      platforms: ['Facebook', 'LINE', 'YouTube'], spendingPower: 'medium', region: 'ทั่วประเทศ',
      painPoint: 'ห่วงสุขภาพ เชื่อรีวิว/คำบอกเล่าจากคนวัยเดียวกัน',
    },
    {
      name: 'นักศึกษา/First Jobber สายไลฟ์สไตล์ 18-25',
      description: 'วัยเริ่มทำงาน ตามไลฟ์สไตล์ แฟชั่น คาเฟ่ ของแต่งห้อง งบกลาง-น้อย',
      ageMin: 18, ageMax: 25, gender: 'mixed',
      interests: ['แฟชั่น', 'คาเฟ่', 'ท่องเที่ยว', 'ของแต่งห้อง', 'ไลฟ์สไตล์'],
      platforms: ['TikTok', 'Instagram'], spendingPower: 'low', region: 'เมืองใหญ่',
      painPoint: 'อยากดูดี/มีสไตล์ในงบจำกัด ตามเทรนด์ทัน',
    },
  ];
  let segCreated = 0;
  for (const seg of THAI_AUDIENCE_SEGMENTS) {
    const existing = await prisma.audienceSegment.findFirst({ where: { name: seg.name } });
    if (!existing) {
      await prisma.audienceSegment.create({ data: { ...seg, createdBy: admin.id } });
      segCreated++;
    }
  }

  // ── ประเภทตัวละคร (Character Category) builtin — สายงานจริงของสตูดิโอ ──
  // upsert ด้วย key: label แก้ได้ภายหลัง (update เฉพาะ builtin ไม่ทับ label ที่ user แก้)
  const BUILTIN_CHARACTER_CATEGORIES: { key: string; label: string }[] = [
    { key: 'presenter', label: 'พรีเซนเตอร์สินค้า' },
    { key: 'reviewer', label: 'รีวิวเวอร์' },
    { key: 'live_host', label: 'นักไลฟ์ขายของ' },
    { key: 'drama_actor', label: 'นักแสดงซีรีส์/ละครสั้น' },
    { key: 'brand_ambassador', label: 'แบรนด์แอมบาสเดอร์' },
    { key: 'beauty', label: 'สายบิวตี้/สกินแคร์' },
    { key: 'food', label: 'สายอาหาร/กิน' },
    { key: 'home_family', label: 'สายแม่บ้าน/ครอบครัว' },
    { key: 'gadget_tech', label: 'สายแกดเจ็ต/เทค' },
    { key: 'fashion', label: 'สายแฟชั่น' },
    { key: 'lifestyle', label: 'สายไลฟ์สไตล์/ท่องเที่ยว' },
    { key: 'comedy', label: 'สายตลก/เอนเตอร์เทน' },
    { key: 'health', label: 'สายสุขภาพ/ออกกำลังกาย' },
    { key: 'expert_kol', label: 'ผู้เชี่ยวชาญ/KOL' },
  ];
  for (let i = 0; i < BUILTIN_CHARACTER_CATEGORIES.length; i++) {
    const { key, label } = BUILTIN_CHARACTER_CATEGORIES[i];
    await prisma.characterCategory.upsert({
      where: { key },
      update: { builtin: true },
      create: { key, label, sortOrder: i, builtin: true },
    });
  }

  // ── Character Blueprint (พิมพ์เขียว) builtin — idempotent: create ถ้ายังไม่มี blueprint ชื่อนี้ ──
  let bpCreated = 0;
  for (const bp of BUILTIN_BLUEPRINTS) {
    const existing = await prisma.characterBlueprint.findFirst({ where: { name: bp.name } });
    if (!existing) {
      await prisma.characterBlueprint.create({
        data: { ...bp, defaults: bp.defaults as Prisma.InputJsonValue, createdBy: admin.id },
      });
      bpCreated++;
    }
  }

  // ── Banned Words Compliance builtin — idempotent upsert on term ──
  // update เฉพาะ {builtin:true} — ไม่ทับ replacement/note/platforms/severity ที่ user แก้เองใน Settings
  let bannedCreated = 0;
  for (const w of BUILTIN_BANNED_WORDS) {
    const before = await prisma.bannedWord.findUnique({ where: { term: w.term }, select: { id: true } });
    await prisma.bannedWord.upsert({
      where: { term: w.term },
      update: { builtin: true },
      create: {
        term: w.term,
        platforms: w.platforms ?? [],
        severity: w.severity,
        category: w.category,
        replacement: w.replacement ?? null,
        note: w.note ?? null,
        builtin: true,
      },
    });
    if (!before) bannedCreated++;
  }

  // ── ตัวอย่าง Location (โลเคชันถ่ายงานจริง: live commerce / short drama / รีวิว) — idempotent by name ──
  const SAMPLE_LOCATIONS = [
    {
      name: 'ครัวบ้านไม้อีสาน (เช้า)',
      type: 'indoor', regionStyle: 'อีสาน/ชนบท', mood: 'อบอุ่น จริงใจ บ้าน ๆ',
      lighting: 'แสงเช้าธรรมชาติลอดหน้าต่างไม้', timeOfDay: 'เช้า',
      prompt:
        'rustic Thai Isan wooden kitchen interior, morning sunlight streaming through wooden window slats, worn teak counter, clay pots and woven baskets, steam rising from a pot, warm authentic atmosphere, photorealistic',
      negativePrompt: 'no modern appliances, no western kitchen, no clutter blocking the counter',
      continuityNotes: 'ผนังไม้สีน้ำตาลเข้ม หน้าต่างอยู่ซ้ายเฟรมเสมอ เขียง+ครกไม้วางขวามือ — ใช้ซ้ำทุกตอนของซีรีส์แม่บ้าน',
    },
    {
      name: 'ห้องนั่งเล่นคอนโดมินิมอล (บ่าย)',
      type: 'indoor', regionStyle: 'เมือง/มินิมอล', mood: 'สบาย โปร่ง ทันสมัย',
      lighting: 'แสงบ่ายนุ่มผ่านม่านโปร่ง', timeOfDay: 'บ่าย',
      prompt:
        'minimal Bangkok condo living room, soft afternoon light through sheer curtains, light oak floor, beige fabric sofa, small monstera plant, clean uncluttered surfaces, photorealistic lifestyle interior',
      negativePrompt: 'no clutter, no dark shadows, no busy patterns',
      continuityNotes: 'โซฟาสีเบจหันหน้าเข้ากล้อง โต๊ะกลางไม้อ่อนวางสินค้าได้ — ฉากหลักรีวิว lifestyle/แกดเจ็ต',
    },
    {
      name: 'สตูดิโอถ่ายสินค้า พื้นหลังขาว',
      type: 'studio', regionStyle: 'สตูดิโอ', mood: 'คลีน โปรดักต์เด่น',
      lighting: 'softbox สองฝั่ง + rim ด้านหลัง', timeOfDay: 'ควบคุมแสงได้',
      prompt:
        'professional product photography studio, seamless white background, two softbox lights with subtle rim light, pristine reflective acrylic surface, commercial packshot quality, photorealistic',
      negativePrompt: 'no harsh shadows, no color cast, no dust or fingerprints on surface',
      continuityNotes: 'ใช้กับ Product Hero Shot ทุกแบรนด์ — พื้นอะคริลิกเงาสะท้อนก้นสินค้าเล็กน้อยเป็นซิกเนเจอร์',
    },
    {
      name: 'ห้องน้ำโมเดิร์น (Skincare Routine)',
      type: 'indoor', regionStyle: 'โมเดิร์น', mood: 'สปา ผ่อนคลาย สะอาด',
      lighting: 'แสงนวลรอบกระจก + แสงธรรมชาติ', timeOfDay: 'เช้า/ค่ำ',
      prompt:
        'modern bathroom vanity, soft diffused mirror lighting, white marble counter with skincare bottles neatly arranged, eucalyptus sprig, spa-like calm atmosphere, photorealistic',
      negativePrompt: 'no water stains, no messy toiletries, no harsh fluorescent light',
      continuityNotes: 'เคาน์เตอร์หินอ่อนขาว กระจกกลมขอบทอง — ฉากประจำคลิป skincare routine เช้า-ก่อนนอน',
    },
    {
      name: 'ตลาดสดตอนเช้า',
      type: 'outdoor', regionStyle: 'ไทยท้องถิ่น', mood: 'คึกคัก มีชีวิต ของสดของจริง',
      lighting: 'แสงเช้าผ่านผ้าใบกันแดดหลากสี', timeOfDay: 'เช้า',
      prompt:
        'bustling Thai fresh morning market, colorful canvas awnings filtering sunlight, fresh vegetables and fruit stalls, ice trays with fresh fish, authentic local vendors atmosphere, documentary photorealistic style',
      negativePrompt: 'no empty stalls, no readable brand signage, no identifiable real faces in background',
      continuityNotes: 'ใช้เปิดคลิปอาหาร/วัตถุดิบ + ไลฟ์ของสด — ระวังหน้าคนจริงในฉากหลัง (เบลอเสมอ)',
    },
    {
      name: 'คาเฟ่มินิมอลกลางเมือง',
      type: 'indoor', regionStyle: 'เมือง/คาเฟ่', mood: 'ชิล อบอุ่น Instagram-able',
      lighting: 'แสงธรรมชาติข้างหน้าต่างใหญ่', timeOfDay: 'สาย-บ่าย',
      prompt:
        'minimal specialty coffee cafe interior, big window natural light, warm wood tones, latte art on marble table, soft bokeh background of shelves with ceramic cups, cozy photorealistic lifestyle',
      negativePrompt: 'no crowd, no brand logos, no overexposed windows',
      continuityNotes: 'โต๊ะหินอ่อนข้างหน้าต่าง = จุดถ่ายประจำ — คลิปไลฟ์สไตล์/นัดคุยงาน/รีวิวขนม',
    },
  ];
  let locCreated = 0;
  for (const loc of SAMPLE_LOCATIONS) {
    const existing = await prisma.location.findFirst({ where: { name: loc.name } });
    if (!existing) {
      await prisma.location.create({ data: loc });
      locCreated++;
    }
  }

  // ── ตัวอย่าง Voice Profile — ผูกกับตัวละครตัวแรกที่มีในระบบ (เช่น "แจ๋ว") ถ้าไม่มีตัวละครจะข้าม ──
  let voiceCreated = 0;
  const firstCharacter = await prisma.character.findFirst({ orderBy: { createdAt: 'asc' } });
  if (firstCharacter) {
    const SAMPLE_VOICES = [
      {
        voiceType: 'เสียงพูดรีวิว (หลัก)',
        tone: 'เป็นกันเอง อบอุ่น เหมือนพี่สาวคุยกับน้อง เชื่อใจได้',
        accent: 'อีสาน (อุดรฯ) ปนภาษากลาง — สลับสำเนียงได้ตามคอนเทนต์',
        speakingSpeed: 'ปานกลาง · เร่งขึ้นเล็กน้อยตอน hook 3 วิแรก',
        laughStyle: 'หัวเราะเต็มเสียง จริงใจ ติดคำว่า "โอ้ยยย"',
        emotionalRange: ['สนุก', 'ตื่นเต้น', 'จริงใจ', 'เอ็นดู', 'เชียร์เต็มที่'],
        sampleDialogues: [
          'โอ้ยยย อันนี้แม่ลองมาแล้วเด้อ ของมันดีต้องบอกต่อ',
          'สามวิแรกฟังก่อน! ถ้าเจ้ากำลังหาตัวช่วยเรื่องผิว อันนี้แหละคำตอบ',
          'บ่ต้องเชื่อแม่ แต่ลองเบิ่งผลลัพธ์นี่ก่อนแล้วค่อยตัดสินใจเด้อ',
        ],
        aiVoiceModel: 'ElevenLabs — Thai female, warm & friendly (ปรับ stability 0.5 / similarity 0.8)',
        usageRights: 'ใช้ภายในบริษัท + งานลูกค้าที่มีสัญญา — ห้ามขายต่อเสียงเดี่ยว',
        status: 'active',
      },
      {
        voiceType: 'เสียงไลฟ์ขายของ (Live Commerce)',
        tone: 'พลังสูง กระตุ้นการตัดสินใจ ปิดการขายเก่ง แต่ไม่กดดันเกิน',
        accent: 'ภาษากลาง ติดสำเนียงอีสานตอนเล่นมุก',
        speakingSpeed: 'เร็ว จังหวะชัด เว้นจังหวะก่อนบอกราคา',
        laughStyle: 'หัวเราะสั้น ๆ คั่นจังหวะ สร้างความเป็นกันเอง',
        emotionalRange: ['เร่งเร้า', 'ตื่นเต้น', 'ขำ', 'จริงจังตอนบอกโปร'],
        sampleDialogues: [
          'สาม สอง หนึ่ง… เปิดตะกร้าเลยจ้าาา ตัวนี้เหลือ 20 ชิ้นสุดท้ายเด้อ',
          'ราคานี้แม่ให้ได้เฉพาะในไลฟ์นี้เท่านั้น ออกจากไลฟ์คือกลับมาราคาเดิมนะลูก',
          'ใครกดตะกร้าแล้วพิมพ์ "รับ" มาเลย เดี๋ยวแม่เช็คให้ทันที',
        ],
        aiVoiceModel: 'ElevenLabs — Thai female, energetic (ปรับ style exaggeration สูง)',
        usageRights: 'ใช้ภายในบริษัท + งานลูกค้าที่มีสัญญา',
        status: 'active',
      },
    ];
    for (const v of SAMPLE_VOICES) {
      const existing = await prisma.characterVoiceProfile.findFirst({
        where: { characterId: firstCharacter.id, voiceType: v.voiceType },
      });
      if (!existing) {
        await prisma.characterVoiceProfile.create({ data: { ...v, characterId: firstCharacter.id } });
        voiceCreated++;
      }
    }
  }

  // ── ตัวอย่าง Prompt Library — prompt ใช้งานจริงสายผลิตคอนเทนต์ (ภาพ/วิดีโอ/ไลฟ์/affiliate) ──
  const SAMPLE_PROMPTS: {
    name: string; promptType: string; bestFlag?: boolean;
    version: { versionLabel: string; body: string; negativeBody?: string; targetPlatform: string; modelName?: string; performanceNote?: string };
  }[] = [
    {
      name: 'Identity — AI Talent หญิงไทย (พรีเซนเตอร์บิวตี้)',
      promptType: 'identity', bestFlag: true,
      version: {
        versionLabel: 'v1', targetPlatform: 'chatgpt', modelName: 'GPT Image',
        body: 'A photorealistic portrait of a 26-year-old Thai, Southeast Asian features woman, warm ivory skin with a healthy glow, soft oval face, gentle double-lid eyes with a friendly sparkle, natural black hair in a loose low bun, minimal clean makeup with peach lip tint, wearing a plain cream blouse, soft studio lighting with clamshell setup, seamless light-grey background, 85mm portrait lens, shallow depth of field, vertical 3:4 framing, 8k sharp focus',
        performanceNote: 'เวิร์กสุดกับ ChatGPT — อย่าใส่ negative block และอย่าพูดถึงคนจริง/ดารา เดี๋ยวโดน policy',
      },
    },
    {
      name: 'Product Hero Shot — สินค้าบิวตี้พื้นขาว',
      promptType: 'shot', bestFlag: true,
      version: {
        versionLabel: 'v1', targetPlatform: 'midjourney', modelName: 'Midjourney v7',
        body: 'commercial product photography of a skincare serum bottle, centered hero composition on seamless white background, glossy acrylic surface with subtle reflection, two softbox lights with delicate rim light tracing the bottle silhouette, water droplets on glass, label perfectly legible, packshot quality --ar 3:4 --style raw',
        negativeBody: 'blurry label, color cast, harsh shadow, dust, fingerprint, extra bottle',
        performanceNote: 'ใช้เป็นภาพปกสินค้า + ภาพ affiliate ได้เลย — เปลี่ยนคำอธิบายขวดตามสินค้าจริง',
      },
    },
    {
      name: 'Macro มือถือสินค้า (UGC จริงใจ)',
      promptType: 'shot',
      version: {
        versionLabel: 'v1', targetPlatform: 'grok', modelName: 'Grok Imagine',
        body: 'macro close-up of a Thai woman\'s hand with short natural nails holding a serum bottle, label facing camera, soft natural window light, warm authentic UGC feel like a real customer photo, slight handheld imperfection, shallow depth of field, photorealistic',
        negativeBody: 'extra fingers, deformed hand, covered label, studio-perfect look, western hand',
        performanceNote: 'คู่กับ Hand Library — ก๊อป descriptor มือจากระบบมาต่อท้ายเพื่อล็อคมือให้นิ่ง',
      },
    },
    {
      name: 'Scene — ครัวบ้านอีสานตอนเช้า (ซีรีส์แม่บ้าน)',
      promptType: 'scene',
      version: {
        versionLabel: 'v1', targetPlatform: 'midjourney', modelName: 'Midjourney v7',
        body: 'rustic Thai Isan wooden kitchen, morning sunlight streaming through wooden window slats on the left, worn teak counter with clay pots and woven baskets, steam rising from a boiling pot, warm nostalgic tones, cinematic wide shot establishing scene --ar 16:9',
        negativeBody: 'modern appliances, western kitchen, clutter',
        performanceNote: 'ฉากเปิดประจำซีรีส์แม่บ้านอีสาน — ล็อคหน้าต่างซ้ายเฟรมตาม continuity ของ Location',
      },
    },
    {
      name: 'Image-to-Video — รีวิวสินค้า UGC 9:16',
      promptType: 'shot', bestFlag: true,
      version: {
        versionLabel: 'v1', targetPlatform: 'kling', modelName: 'Kling 2.5',
        body: 'The woman naturally lifts the serum bottle toward the camera, smiles warmly, then pumps the serum onto the back of her hand and gently spreads it, subtle handheld camera sway, natural indoor lighting, realistic skin detail, smooth 5-second motion, no morphing',
        negativeBody: 'face morphing, extra fingers, label distortion, jerky motion',
        performanceNote: 'ใส่ภาพนิ่งจาก ChatGPT/Grok เป็น first frame แล้วใช้ prompt นี้สั่ง motion — ได้คลิปรีวิวสั้นเนียน ๆ',
      },
    },
    {
      name: 'Live Hook 3 วิ — เปิดไลฟ์ขายของ',
      promptType: 'shot',
      version: {
        versionLabel: 'v1', targetPlatform: 'veo', modelName: 'Veo 3',
        body: 'Energetic Thai female presenter looks straight into camera, holds product up with both hands and says an exciting opening line, quick push-in camera move, bright ring light, live-commerce studio with product shelves behind, vertical 9:16, punchy 3-second hook',
        negativeBody: 'slow pacing, dim lighting, empty background',
        performanceNote: 'ใช้ทำ intro ก่อนตัดเข้าไลฟ์จริง / ตัวอย่างโปรโมทไลฟ์ล่วงหน้า',
      },
    },
    {
      name: 'Negative กลาง — งานสินค้า/มือ (กันภาพเพี้ยน)',
      promptType: 'negative',
      version: {
        versionLabel: 'v1', targetPlatform: 'grok', modelName: 'ใช้ได้ทุก tool ที่รองรับ negative',
        body: 'deformed hands, extra fingers, missing fingers, warped product, distorted label, unreadable text, watermark, oversaturated colors, plastic skin, uncanny face, western features when Thai is specified, brand logo hallucination',
        performanceNote: 'ก๊อปต่อท้าย prompt ฝั่ง Grok/Midjourney ได้ทันที — ChatGPT/Gemini ไม่ต้องใช้ (ไม่รองรับ)',
      },
    },
    {
      name: 'Anti-clone — กติกากันตัวละครซ้ำ/ติด IP',
      promptType: 'anti_clone',
      version: {
        versionLabel: 'v1', targetPlatform: 'chatgpt', modelName: 'ทุกค่าย',
        body: 'ห้ามอ้างอิงหน้าดารา/บุคคลจริง/ตัวละครลิขสิทธิ์ · คงจุดอัตลักษณ์ประจำตัวละคร (เช่น ไฝ ลักยิ้ม ทรงผมซิกเนเจอร์) ครบทุกครั้ง · เปลี่ยนได้เฉพาะชุด/ท่า/ฉาก ห้ามเปลี่ยนโครงหน้า · ถ้า AI ให้หน้าคล้ายคนดัง ให้ regenerate ทันที',
        performanceNote: 'กติกาภายในทีม — แนบท้ายทุก brief ที่ส่งให้ freelance/ทีม gen ภาพ',
      },
    },
  ];
  let promptCreated = 0;
  for (const p of SAMPLE_PROMPTS) {
    const existing = await prisma.prompt.findFirst({ where: { name: p.name } });
    if (!existing) {
      await prisma.prompt.create({
        data: {
          name: p.name,
          promptType: p.promptType,
          status: 'approved',
          bestFlag: p.bestFlag ?? false,
          createdBy: admin.id,
          versions: { create: { ...p.version, createdBy: admin.id } },
        },
      });
      promptCreated++;
    }
  }

  const ugcOverridesSummary = await seedUgcPromptOverrides(admin.id);

  console.log(ugcOverridesSummary);
  console.log(
    `Seeded ${Object.keys(ROLES).length} roles, ${PLATFORMS.length} platforms, ${BUILTIN_CATEGORIES.length} builtin categories, ${demoClients.length} demo clients, ${demoJobs.length} demo jobs, +${segCreated}/${THAI_AUDIENCE_SEGMENTS.length} audience segments, cameras +${cameraCreated}/${BUILTIN_CAMERAS.length}, lightings +${lightingCreated}/${BUILTIN_LIGHTINGS.length}, blueprints +${bpCreated}/${BUILTIN_BLUEPRINTS.length}, banned words +${bannedCreated}/${BUILTIN_BANNED_WORDS.length}, ${BUILTIN_CHARACTER_CATEGORIES.length} char categories, locations +${locCreated}/${SAMPLE_LOCATIONS.length}, voices +${voiceCreated}, prompts +${promptCreated}/${SAMPLE_PROMPTS.length}`,
  );
  console.log(`Admin login: ${adminEmail} / ${adminPassword}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });






