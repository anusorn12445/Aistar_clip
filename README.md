# 🎬 AISTAR Talent OS — AI Clip Factory

ระบบผลิตคลิปรีวิวสินค้า UGC สั้นด้วย AI (ภาพนิ่ง + วิดีโอ Veo / Google Flow) พร้อมระบบ **prompt + QC วนแก้อัตโนมัติ** และงานหลังบ้าน (RBAC, character, asset, export) ครบวงจร

> เอกสารสรุปสถาปัตยกรรม + ระบบ prompt/QC ฉบับเต็มอยู่ที่ [`AI-CLIP-FACTORY.md`](AI-CLIP-FACTORY.md)

---

## 1. สถาปัตยกรรม

```text
takra-clip-factory/  (monorepo, pnpm workspace)
├── apps/api    NestJS + Prisma + PostgreSQL   :4000  prefix /api
├── apps/web    Next.js + Tailwind             :3000
├── packages/mcp   MCP server (read + draft_write เท่านั้น)
├── extension/aistar-flow   Chrome extension (ดึงข้อมูล/รูปสินค้า Shopee)
├── prompts/    ก้อน prompt แม่ (ASMR / CDrama / Veo) ใช้ต่อยอดคลิป
└── _docs/      SRS / PRD / spec
```

- **AI:** OpenAI `gpt-4o` / `gpt-4o-mini` (Product Sheet vision, QC วนแก้, ตัดบท) + Anthropic `claude-opus-4-8` (Character wizard)
- **Dev:** PowerShell 7 บน Windows — รันจากในโฟลเดอร์ repo เสมอ

---

## 2. ติดตั้งและรัน

```bash
# ครั้งแรก
pnpm install
cp .env.example apps/api/.env      # แล้วกรอกค่าจริง (ดูหัวข้อ 3)
pnpm --filter api prisma:migrate   # สร้างตาราง
pnpm --filter api prisma:seed      # roles + permission matrix + admin + platforms

# รันประจำวัน (คนละหน้าต่าง)
pnpm dev:api      # NestJS  :4000
pnpm dev:web      # Next.js :3000
```

**Login แรก:** `admin@aistar.local` / `aistar-admin-2026` — เปลี่ยนรหัสก่อนใช้จริง

---

## 3. Environment (`apps/api/.env`)

คัดลอกจาก [`.env.example`](.env.example) แล้วกรอกค่า สำคัญ:

- `DATABASE_URL` — PostgreSQL
- `OPENAI_API_KEY` — Product Sheet vision + QC + ตัดบท
- `ANTHROPIC_API_KEY` — AI Character Wizard (`claude-opus-4-8`)
- `JWT_SECRET` — เปลี่ยนก่อน production

> `.env` จริง **ไม่ถูก commit** (กันไว้ใน `.gitignore`) — มีเฉพาะ `.env.example` เป็น template

---

## 4. ระบบ Prompt / QC

หัวใจของโปรเจกต์คือ pipeline สร้าง prompt แล้ว **QC วนแก้จนผ่านเกณฑ์** ก่อนส่งออก Veo/Flow
รายละเอียดกติกา (iron rules, negative set, ล็อก identity ข้ามฉาก, คุมความยาวพูด ฯลฯ) อยู่ใน [`AI-CLIP-FACTORY.md`](AI-CLIP-FACTORY.md)

ก้อน prompt แม่ที่ใช้ต่อยอด — ดู [`prompts/`](prompts/):

| ไฟล์ | ใช้ทำอะไร |
|------|-----------|
| [`prompts/asmr-unbox-base-prompt-v2.md`](prompts/asmr-unbox-base-prompt-v2.md) | รีวิวสินค้าแกะกล่องแนว ASMR (เวอร์ชันใช้จริง) |
| [`prompts/asmr-base-prompt.md`](prompts/asmr-base-prompt.md) | ก้อนแม่หมวด ASMR ทั่วไป |
| [`prompts/Ultimate_CDrama_Master_Prompt_V3.md`](prompts/Ultimate_CDrama_Master_Prompt_V3.md) | master prompt ซีรีย์จีนกำลังภายในเชิงภาพยนตร์ |
| [`prompts/cdrama-episode-01.md`](prompts/cdrama-episode-01.md) | ตัวอย่างสคริปต์ตอน (15 คลิป × 10 วิ) |

---

## 5. MCP Server

```bash
pnpm --filter @aistar/mcp build
# วิธีตั้ง token + เพิ่มเข้า Claude ดูที่ packages/mcp/README.md
```

MCP มีเฉพาะ `read` + `draft_write` (ตาม Decision D8) — ไม่มีสิทธิ์เขียนทับข้อมูลจริง

---

## 6. สถานะ Phase 1

- [x] Auth (email+password, JWT) + RBAC 14 roles ตาม Permission Matrix
- [x] Character CRUD + display code (CHR-XXX-001) + state machine + optimistic lock
- [x] Version snapshot (entity_versions) + Audit log
- [x] Web: login + character list/create/detail
- [x] AI Character Wizard — `POST /ai/characters/draft` (`claude-opus-4-8`, guardrails §G.2)
- [x] Asset Gallery — upload + link + primary reference + status workflow
- [x] Prompt Library — platform-agnostic (Grok/Kling/Veo/…) + versions + generation runs
- [x] Export Package — ZIP ตามโครง §8.3 (background job + download log)
- [x] MCP server — `packages/mcp`
- [x] E2E tests — `pnpm --filter api test:e2e` (ใช้ database `aistar_test` แยก)

---

## 7. เอกสารเพิ่มเติม

- [`AI-CLIP-FACTORY.md`](AI-CLIP-FACTORY.md) — สถาปัตยกรรม + ระบบ prompt/QC ฉบับเต็ม
- [`DEPLOY_RAILWAY.md`](DEPLOY_RAILWAY.md) — วิธี deploy ขึ้น Railway
- [`_docs/veo-extension-README.md`](_docs/veo-extension-README.md) — คู่มือติดตั้ง Chrome extension + web builder
- [`_docs/`](_docs/) — SRS / PRD / spec ทั้งหมด
