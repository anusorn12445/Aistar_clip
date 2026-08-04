# 🎬 AISTAR Talent OS — AI Clip Factory

ระบบผลิตคลิปรีวิวสินค้า UGC สั้นด้วย AI (ภาพนิ่ง + วิดีโอ Veo/Google Flow) พร้อมระบบ QC/prompt ครบวงจร
เอกสารนี้สรุปสถาปัตยกรรม วิธีติดตั้ง และระบบ prompt/QC ที่พัฒนาไว้ทั้งหมด

---

## 1. สถาปัตยกรรม

```text
takra-clip-factory/  (monorepo, pnpm workspace)
├── apps/api    NestJS + Prisma + PostgreSQL   :4000  prefix /api
├── apps/web    Next.js + Tailwind             :3000
├── packages/mcp   MCP server (read + draft_write)
├── extension/aistar-flow   Chrome extension (Shopee scraper)
└── _docs/      SRS/PRD
```

- **AI:** OpenAI `gpt-4o` / `gpt-4o-mini` (Product Sheet vision, QC วนแก้, ตัดบท) + Anthropic `claude-opus-4-8` (Character wizard)
- **Windows dev:** PowerShell 7, รันจากในโฟลเดอร์ repo เสมอ

---

## 2. ติดตั้งและรัน

```bash
# ครั้งแรก
pnpm install
cp .env.example apps/api/.env      # แล้วกรอกค่าจริง (ดูหัวข้อ 3)
pnpm --filter api prisma:migrate   # สร้างตาราง
pnpm --filter api prisma:seed      # roles + permission + admin + platforms

# รันประจำวัน (คนละหน้าต่าง)
pnpm dev:api      # NestJS  :4000
pnpm dev:web      # Next.js :3000
```

**Login แรก:** `admin@aistar.local` / `aistar-admin-2026` (เปลี่ยนรหัสก่อนใช้จริง)

### Windows: ปัญหาที่เจอบ่อย
- **ต้อง `cd` เข้า repo ก่อนรัน** — รันจาก `System32` จะ `No projects found`
- **Port ชน** (`EADDRINUSE`) — ฆ่าโปรเซสเก่าก่อน restart:
  ```powershell
  netstat -ano | findstr :4000 | findstr LISTENING   # ได้ PID ท้ายบรรทัด
  taskkill /PID <PID> /F                              # แทน <PID> ด้วยเลขจริง
  ```
  (ทำเดียวกันกับ :3000)

---

## 3. Environment variables (`apps/api/.env`)

| Key | หมายเหตุ |
|-----|----------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | สุ่มยาว ๆ (`openssl rand -base64 48`) |
| `CORS_ORIGIN` | โดเมน web (คั่น comma ได้) |
| `STORAGE_DIR` | โฟลเดอร์เก็บไฟล์ upload/export |
| `ANTHROPIC_API_KEY` | Character wizard |
| `OPENAI_API_KEY` | **AI Clip Factory** (Product Sheet, QC, ตัดบท) |

> `.env` ถูก `.gitignore` แล้ว — ห้าม commit ค่าจริง ใช้ `.env.example` เป็นแม่แบบ

---

## 4. ระบบ Prompt (แท็บ Recipes)

Prompt ประกอบขึ้นจากหลายชั้นตอน compose ทุกครั้งที่ recompose — **โครงเหล็กมาจากโค้ด แก้ไม่ได้** เพื่อความสม่ำเสมอ:

### 4 แท็บเบสพรอม
1. **สูตรคลิป** — base prompt ต่อหมวด (มี negativeStill / negativeVideo แยก)
2. **Prompt ประเภทสินค้า** — ต่อแพ็กเกจ มี 4 ช่อง: Prompt ภาพนิ่ง / Prompt วิดีโอ / Negative ภาพนิ่ง / Negative วิดีโอ
3. **Prompt ประเภทฉาก** — rule + negative แยก "เห็น/ไม่เห็นสินค้า"
4. **Domain Prompt** — ต่อช่วงเรื่อง (hook→reveal→demo→interaction→result→cta)

### ล็อกที่ฝังอัตโนมัติทุก prompt
- **🔊 WITH FULL AUDIO** หัวก้อน + Clear audible sound (สู้คลิปเงียบ)
- **🖐 ล็อกมือ ≤2** สามชั้น: กติกาฉากบวก → negative ระดับฉาก → negative universal ทุกสูตร
- **🧩 ล็อกสินค้า** — Product ground truth จาก Product Sheet (รูปจริง) + "copy exactly, never redesign"
- **🚫 AVOID เรียงตามความสำคัญ** — สินค้า → มือ → ตัดฉาก → morph → ลิปซิงค์ → เสียง → watermark
- **🗣 ชุดกันพูดมั่ว** — บรรทัดสุดท้ายก่อน AVOID (ไม่พ่วงบรรทัดพูด ไม่ซ้ำซ้อน)
- **🤲 จัดมือ 2 ข้างตาม section** — เห็นสินค้า: มือถือของ + มือแตะหน้า / ไม่เห็น: มือว่าง (กันมืองอกที่ 3)
- **🛒 CTA ไม่ใช้สินค้า** — ช่วงปิดแค่ถือโชว์ + ชี้ตะกร้า (ตัด action ใช้สินค้าออก)

### ภาพนิ่ง vs วิดีโอ
- **ภาพนิ่ง:** ภาษาสถานะหยุด เฟรมเดียว ("held mid-air", "lather already on the face")
- **วิดีโอ:** ภาษาเคลื่อนไหวมีจังหวะ ("slowly dispenses", "then massages")

---

## 5. ระบบ QC (ตรวจ prompt)

### ชั้นที่ 1 — เกณฑ์กติกา (deterministic, ฟรี, ผลนิ่ง ~20 ข้อ)
โครง prompt (มี video / บรรทัดความยาว / WITH FULL AUDIO / long take / AVOID ก้อนท้าย / ไม่มีเศษ negative หลุด) · บทพูด+เสียง (บทตรงปัจจุบัน / saying exactly / งบพยางค์ / Clear audible sound) · เศษตกค้าง · ล็อกมือ (ภาพ+วิดีโอ) · ล็อกสินค้า (Product Sheet) · ชุดกันพูดมั่ว 3 ข้อ

### ชั้นที่ 2 — AI วิเคราะห์ลึก 3 แกน (กติกาหลักฐาน: fail ต้อง quote จริง)
- **usageAction** — ท่าถูกตาม section (demo/interaction=ใช้งาน · cta/hook=ไม่ใช้ · reveal/result=โชว์)
- **firstFrame** — เฟรมแรกเข้ากับ section
- **speechLock** — ล็อกพูดครบ ไม่ขัดกันเอง

### checklist เต็ม
แผง QC โชว์ทุกข้อพร้อม ✓/✗ (แม้ตอนผ่านหมด) — ข้อที่ไม่เกี่ยวกับ shot นั้นไม่แสดง

### เครื่องมือแก้
- **🔧 ปรับอัตโนมัติ** — recompose + ขัดเศษ (ข้อโครงสร้าง)
- **✂️ AI ตัดบท** — บทเกินงบ
- **🩹 ฝังคำแนะนำ** — รายช่อง
- **🪄 วนแก้จนเขียว (SMART LOOP)** — วนไม่จำกัดตราบที่คืบหน้า, หยุดเมื่อเขียวหมด/ติดหล่ม/ครบ 10 รอบ
  - แก้แบบ **targeted** เฉพาะแกนที่แดง (ช่องเขียวไม่โดนแตะ)
  - แยก "เครื่องแก้ได้" vs "ต้องทำเอง" (เช่น วิเคราะห์ Product Sheet ที่ AI ทำแทนไม่ได้)
- **🪄 วนแก้ทุก shot** (ปุ่มบนสุด, sticky) — วนแก้ทั้งบอร์ดในคลิกเดียว + เด้งแผงละเอียดทุก shot

### 🔍 Vision QC (เทียบภาพเจนกับรูปจริง)
matchScore 0-100 + นับมือ/นิ้ว (เกิน 2 มือ / นิ้วผิด = fail ทันที) — ผ่าน ≥85 ค่อยเจนวิดีโอ

---

## 6. หมวดสินค้า (recipes)

ASMR · ก่อน/หลัง · บิวตี้ · แกดเจ็ต · ทั่วไป · ไลฟ์ขาย · ยาสีฟัน · How-to · Unbox · Software feature
แต่ละหมวดปรับ negative เฉพาะทาง (เช่น โฟม: ฟองเพี้ยน / ยาสระผม: viscosity เปลี่ยนกลางคลิป)

---

## 7. หลักการเจนให้แม่นยำ (workflow แนะนำ)

1. **วิเคราะห์ Product Sheet จากรูปจริงก่อน** (ครั้งเดียวต่อสินค้า) — หัวใจกันสินค้าเพี้ยน
2. **แนบรูปสินค้าจริงเป็น reference ทุกครั้งที่เจน** — ฉลากไทยโมเดลวาดเองไม่ได้
3. **เจนภาพนิ่งก่อน → 🔍 เทียบรูปจริงให้ผ่าน (≥85) → ค่อยเจนวิดีโอ** (คัดตั้งแต่ภาพถูกกว่าเผาโควต้าวิดีโอ)
4. **วิดีโอ i2v ใช้ภาพนิ่งที่ผ่านเป็นเฟรมตั้งต้น** — สินค้าในคลิปสืบทอดจากภาพที่ตรง
5. ต่อฉาก: เฟรมสุดท้ายฉากก่อน → เฟรมตั้งต้นฉากถัดไป (continuity)

> **ข้อจำกัดที่ prompt เอาไม่อยู่:** คลิปเงียบ (i2v+ไทย สุ่มไม่ใส่เสียง — เจนใหม่ได้) และมือผีกลางคลิปวิดีโอ (ระบบวิเคราะห์ไฟล์วิดีโอไม่ได้ ต้องตาดูตอนรีวิว)

---

## 8. มาตรฐานการอัปเดตโค้ด

ทุกอัปเดต = **update zip + apply-*.ps1 (ASCII-only)**
- backup ไป `_backup-<name>-<timestamp>` ก่อนทับ
- `cmd /c copy /y` ต่อไฟล์ (รองรับ path มี `[id]`)
- verify ด้วย `Select-String -LiteralPath -SimpleMatch` — **นับจำนวนจริงในไฟล์ก่อนตั้งเกณฑ์**
- รัน: `powershell -ExecutionPolicy Bypass -File "...\apply-xxx.ps1"`

---

## 9. Chrome Extension (aistar-flow)

Shopee product scraper — ดึงข้อมูลสินค้า (ชื่อ/รูป/ราคา) เข้าระบบเพื่อสร้าง Clip Job
ติดตั้ง: `chrome://extensions` → Load unpacked → เลือกโฟลเดอร์ `extension/aistar-flow`
