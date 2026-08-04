# 🏗️ โครงสร้างโปรแกรม + โครงสร้าง Prompt

เอกสารนี้อธิบายว่าโปรแกรมแบ่งเป็นส่วนไหนบ้าง และระบบ **prompt / QC** ประกอบขึ้นมาอย่างไร

---

## 1. โครงสร้างโปรแกรม (Monorepo)

```text
takra-clip-factory/            pnpm workspace
├── apps/
│   ├── api/                   NestJS + Prisma + PostgreSQL  (:4000, prefix /api)
│   │   ├── src/               โมดูลธุรกิจ (ดูตารางด้านล่าง)
│   │   ├── prisma/            schema + migrations
│   │   └── test/              E2E tests (database aistar_test แยก)
│   └── web/                   Next.js + Tailwind  (:3000)
│       └── src/
│           ├── app/           หน้าเว็บ (App Router) — 40+ หน้า
│           ├── lib/           promptBuilders.ts (ประกอบ prompt ฝั่ง client)
│           └── components/    PromptViewerModal ฯลฯ
├── packages/mcp/              MCP server (read + draft_write เท่านั้น)
├── extension/aistar-flow/     Chrome extension (ดึงข้อมูล/รูปสินค้า Shopee)
├── prompts/                   ก้อน prompt แม่ (ASMR / CDrama)
└── _docs/                     SRS / PRD / spec / เอกสารนี้
```

### โมดูล Backend (`apps/api/src/`)

| กลุ่ม | โมดูล | หน้าที่ |
|-------|-------|--------|
| **แกน prompt/clip** | `affiliate-clips` | เครื่องประกอบคลิป UGC — flow-policy, packaging-prompts, review-recipes, ugc.schemas |
| | `prompts` | Prompt Library + Prompt Hub (compose/snapshot) + platforms + capture |
| | `image-requests` | คำขอภาพ + draft-prompt |
| | `exports` | ประกอบ image-prompt + export ZIP |
| **AI** | `ai` | Character wizard (Claude), affiliate, series, phase4, library capture |
| | `ai-usage` | บันทึก/จำกัดการใช้ AI (accountability) |
| **QC** | `library/qc` | ระบบ QC review (ตรวจ + ให้คะแนน + วนแก้) |
| **เนื้อหา/ตัวละคร** | `characters`, `products`, `media`, `assets`, `campaigns`, `episodes` | ข้อมูลหลัก |
| **แพลตฟอร์ม/แกนระบบ** | `auth`, `users`, `settings`, `jobs`, `notifications`, `search`, `dashboard`, `prisma` | ระบบพื้นฐาน + RBAC 14 roles |
| **อื่น ๆ** | `content-intelligence`, `intelligence`, `audience`, `performance`, `kpi`, `compliance`, `production`, `publishing`, `interaction`, `tie-ins`, `tasks` | ฟีเจอร์เสริม |

### Frontend (`apps/web/src/app/`)

หน้าเว็บหลักที่เกี่ยวกับ prompt/clip:
- `prompts/` — Prompt Hub, Quick Capture, Prompt Examples
- `clip-jobs/scene-prompts/` + `clip-jobs/packaging-prompts/` — prompt รายฉาก + ตามแพ็กเกจ
- `affiliate/` — สร้างคลิปรีวิว affiliate
- `characters/` — ตัวละคร + `imagePrompt.ts`
- `lib/promptBuilders.ts` — ประกอบ prompt variants ต่อ tool ฝั่ง client

---

## 2. โครงสร้าง Prompt (การประกอบ)

prompt หนึ่งฉากไม่ได้เขียนมือทั้งก้อน แต่ **ประกอบจากหลายชั้น** ที่คุมคนละเรื่อง แล้วรวมเป็น prompt สุดท้าย

```text
                     ┌─────────────────────────────────────────────┐
   INPUT             │  Product Sheet (จากภาพ, OpenAI vision)        │
                     │  + Character / Hand profile / Location        │
                     └───────────────────┬─────────────────────────┘
                                         │
   LAYER 1  สูตรรีวิว   review-recipes.ts │  sceneFlow (ลำดับเล่าเรื่อง) + promptEmphasis
            (ต่อประเภท) ─────────────────┤  (still cues / video cues) + negative ต่อสูตร
                                         │
   LAYER 2  แพ็กเกจ    packaging-prompts │  บล็อกภาษาต่อรูปแบบแพ็กเกจสินค้า
            สินค้า     ─────────────────┤  (promptStill / promptVideo / negativeStill/Video)
                                         │
   LAYER 3  ประกอบ     prompt-hub.compose│  รวมทุกชั้นเป็น body + negative
            (server)   promptBuilders(web)│  แยก "ภาพนิ่ง (still)" กับ "วิดีโอ (motion)"
                                         │
                                         ▼
   GUARD    Flow Policy  flow-policy.ts   │  ตรวจถ้อยคำที่ Google Flow มักปฏิเสธ
            (auto-fix)  ─────────────────┤  → เขียนใหม่ให้ผ่าน content filter (คงความหมาย)
                                         │
                                         ▼
   QC       library/qc + iron rules       │  ตรวจตามกติกาเหล็ก → ถ้าไม่ผ่าน วนแก้ (auto-fix loop)
            ─────────────────────────────┤  จนผ่านเกณฑ์ทุกข้อ
                                         ▼
   OUTPUT   prompt สุดท้าย (still + motion + negative)  →  Veo / Google Flow
```

### ชั้นของ prompt แต่ละฉาก

| ชั้น | ไฟล์ | คุมอะไร |
|------|------|--------|
| **สูตรรีวิว** | `affiliate-clips/review-recipes.ts` | ลำดับการเล่า (sceneFlow) + จุดเน้นภาพ/วิดีโอ + CTA ปิดคลิป ต่อ "ประเภทตัวถูกรีวิว × หมวด" (product / place / food / software) |
| **แพ็กเกจสินค้า** | `affiliate-clips/packaging-prompts.ts` | ภาษาอธิบายแพ็กเกจ + negative กันแพ็กเกจเพี้ยน (แยก still / video) ผูกกับ `Product.packagingType` |
| **การประกอบ** | `prompts/prompt-hub.compose.ts` (server), `web/lib/promptBuilders.ts` (client) | รวมทุกชั้น → body + negative, แยก still (ภาพนิ่ง) กับ motion (วิดีโอ) |
| **Policy Guard** | `affiliate-clips/flow-policy.ts` | ตรวจ + auto-fix ถ้อยคำเสี่ยงถูก Flow ปฏิเสธ (deterministic, ไม่เรียก AI) |
| **QC** | `library/qc/qc.service.ts` + iron rules | ตรวจตามกติกา แล้ววนแก้จนผ่าน |

### หลักการสำคัญของ prompt (iron rules ที่ยึด)

- **แยกภาพนิ่ง/วิดีโอ** — still ใช้ภาษา "หยุดนิ่ง", motion ใช้ภาษา "การเคลื่อนไหว" คนละชุด
- **negative ครบชุด + เรียงลำดับ** — ปิดท้ายทุก prompt ด้วย `AVOID: ...`
- **ล็อก identity ข้ามฉาก** — ตัวละคร/มือ/สินค้าต้องคงเดิมทุกฉาก
- **คุมความยาวพูด** — บทพอดี ~4 วินาที/ฉาก (คุมจำนวนพยางค์)
- **เลี่ยงประโยคปฏิเสธใน prompt** — โมเดลอ่านคลาด ใช้ negative แยกแทน
- **ห้ามด้นสด** — โมเดลห้ามเติมเนื้อหานอกบท/นอก Product Sheet

### ก้อน prompt แม่ (ใช้ต่อยอด)

อยู่ใน [`prompts/`](../prompts/) — ASMR unbox review, ASMR base, CDrama master, ตัวอย่างสคริปต์ตอน
ดูสารบัญที่ [`prompts/README.md`](../prompts/README.md)

---

## 3. AI ที่ใช้

| งาน | โมเดล | ที่ไหน |
|-----|-------|--------|
| อ่าน Product Sheet จากภาพ | OpenAI `gpt-4o` (vision) | `ai/` + `products` |
| QC วนแก้ + ตัดบท | OpenAI `gpt-4o` / `gpt-4o-mini` | `library/qc`, `affiliate-clips` |
| Character Wizard | Anthropic `claude-opus-4-8` | `ai/ai-claude.service.ts` |

> ระบบ prompt/QC ฉบับกติกาเต็ม ดู [`AI-CLIP-FACTORY.md`](../AI-CLIP-FACTORY.md)
> ประวัติการแก้ทั้งหมด ดู [`CHANGELOG.md`](../CHANGELOG.md)
