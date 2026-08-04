# 📝 CHANGELOG — บันทึกการแก้โปรเจกต์

บันทึกสิ่งที่แก้ตั้งแต่รับโปรเจกต์ **AI Clip Factory** มาปรับปรุง ช่วง **30 ก.ค. – 4 ส.ค. 2026**

> ประวัติสร้างจากลำดับการแก้จริง (แต่ละครั้งมี snapshot สำรองก่อนแก้ + สคริปต์ `apply-*.ps1`)
> เรียงตามเวลา จัดกลุ่มตามธีมของงาน — จำนวนการแก้รวมกว่า **100 ครั้ง**

---

## 🆚 เทียบกับของเดิม (baseline 21 ก.ค. 2026)

ของเดิมคือ **AISTAR Talent OS — Phase 1**: Auth/RBAC 14 roles, Character CRUD, Asset Gallery, Prompt Library/Hub, Export Package (ZIP), QC review, MCP server
สิ่งที่ **เพิ่มเข้ามาใหม่** ช่วง 30 ก.ค.–4 ส.ค. คือชั้น "โรงงานผลิตคลิป" (AI Clip Factory) — รวม **43 ไฟล์ที่ถูกแตะ**

### ✅ เพิ่มใหม่ทั้งระบบ (ของเดิมไม่มี)

| ระบบใหม่ | ไฟล์หลัก |
|----------|----------|
| **UGC Clip Engine** — ประกอบพรอมป์คลิปรีวิว | `apps/api/src/affiliate-clips/` ทั้งโมดูล (`flow-policy.ts`, `packaging-prompts.ts`, `review-recipes.ts`, `ugc.schemas.ts`, controller/service/module/dto) |
| **Flow Policy Guard** — ตรวจ+auto-fix ให้ผ่าน content filter | `affiliate-clips/flow-policy.ts` |
| **Product Sheet AI** — อ่านสเปกสินค้าจากภาพ (vision) | `apps/api/src/products/product-sheet-ai.service.ts` |
| **Character Vision** — วิเคราะห์ตัวละครจากภาพ | `characters/character-vision.*`, `characters/capture-merge.ts`, `ai/ai-character-capture.service.ts`, web `components/character/AnalyzeFromImageButton.tsx` |
| **Clip Jobs UI** — หน้าจัดการงานคลิป | web `app/clip-jobs/` (`recipes/`, `scene-prompts/`, `packaging-prompts/`, `[id]/`) |
| **Image Prompt export** | `apps/api/src/exports/image-prompt.ts` |
| **DB migration ใหม่ 2 ตัว** | `20260730150000_shot_show_product`, `20260730160000_product_packaging_type` |
| **libs ฝั่ง web** | `lib/catalog.ts`, `lib/clip-jobs.ts` |

### 🔧 ต่อยอด/แก้ของเดิม (มีอยู่แล้ว → เพิ่มความสามารถ)

- `apps/api/src/app.module.ts` — ลงทะเบียนโมดูลใหม่
- `prisma/schema.prisma` + `prisma/seed.ts` — เพิ่มฟิลด์/ข้อมูล (packagingType, shot show product ฯลฯ)
- `ai/ai.controller.ts`, `ai/ai.service.ts`, `ai/ai-claude.service.ts`, `ai/ai-affiliate.service.ts` — ต่อ endpoint AI
- `products/products.controller.ts`, `products/products.module.ts`, `products/dto/create-product.dto.ts` — รองรับ packaging type + product sheet
- `settings/setting-keys.ts`, `prisma/prisma.service.ts` — คีย์ตั้งค่า/DB helper
- web: `components/AppShell.tsx` (เมนูใหม่), `app/characters/[id]/page.tsx`, `app/products/page.tsx`, `app/products/[id]/page.tsx`

> วิธีเทียบ: ไฟล์ที่ mtime ใหม่กว่า baseline 21 ก.ค. (ไม่นับ `node_modules` / `_backup-*`)

---

## 🗓️ 30 ก.ค. — วางโครงคลิป UGC + สูตรรีวิว

ตั้งฐานระบบผลิตคลิปรีวิวสินค้า UGC และหน้าเว็บหลัก

| งาน | แก้ตรงไหน |
|-----|-----------|
| `recipes` (×3) | สูตรรีวิวต่อประเภทตัวถูกรีวิว → `apps/api/src/affiliate-clips/review-recipes.ts` |
| `openai` | เชื่อม OpenAI (`gpt-4o`) เข้ากับ pipeline วางแผน/ตัดบท |
| `packaging` | prompt ต่อรูปแบบแพ็กเกจสินค้า → `affiliate-clips/packaging-prompts.ts` |
| `createpage` / `menus` / `tabs` | หน้าเว็บ + เมนู + ระบบแท็บ (`apps/web`) |
| `negatives` | ชุด negative prompt กันภาพเพี้ยน |
| `scenetoggle` | เปิด/ปิดฉากรายตัว |
| `hideproduct` (×2) | ซ่อนสินค้าในบางฉาก (ฉากเล่าเรื่อง ไม่โชว์ของ) |
| `promptmixer` | ผสม/รวมบล็อก prompt |
| `imageprompt` | prompt ภาพนิ่ง → `exports/image-prompt.ts` |

---

## 🗓️ 31 ก.ค. (เช้ามืด) — Flow Policy Guard

แก้ปัญหา Google Flow (Veo/Imagen) ปฏิเสธ prompt ด้วย content policy

| งาน | แก้ตรงไหน |
|-----|-----------|
| `flowtune` (×2) | จูนถ้อยคำ prompt ให้ผ่าน filter |
| `flowpolicy` (×4) | ตัวตรวจ + auto-fix เขียน prompt ใหม่ให้ผ่าน โดยคงความหมายเดิม → `affiliate-clips/flow-policy.ts` |
| `policyrule` | เพิ่มกฎตรวจจับถ้อยคำเสี่ยง (deterministic ไม่เรียก AI) |

---

## 🗓️ 31 ก.ค. (เช้า) — AI Character Wizard

ระบบสร้าง/วิเคราะห์ตัวละครด้วย AI (Claude `claude-opus-4-8`)

| งาน | แก้ตรงไหน |
|-----|-----------|
| `charvision` | วิเคราะห์ตัวละครจากภาพ → `ai/ai-character-capture.service.ts` |
| `analyzechar-v2` | ปรับ logic วิเคราะห์ตัวละคร v2 |
| `generatebible` | สร้าง "character bible" อัตโนมัติ |
| `charai` (×2) | รวม AI character wizard เข้าหน้าเว็บ + guardrails |
| `thaipolicy` | นโยบายภาษาไทยในการ gen |
| `togglefix` / `flowsafe` | แก้ toggle + ทำ prompt ปลอดภัยกับ Flow |

---

## 🗓️ 31 ก.ค. (สาย–เที่ยง) — Dual/Domain Prompt + คุมฉาก

แยก prompt ภาพนิ่ง/วิดีโอ และคุมโครงฉาก

| งาน | แก้ตรงไหน |
|-----|-----------|
| `dualprompt` / `domainprompt` | แยก prompt เป็นภาพนิ่ง + วิดีโอ ตาม domain |
| `hiddenscene` (×2) / `scenetab` | ฉากซ่อน + แท็บฉาก |
| `hookdual` | hook เปิดคลิปแบบคู่ |
| `nonegation` | เลี่ยงประโยคปฏิเสธใน prompt (โมเดลอ่านคลาด) |
| `masterprompt` / `mastertrim` / `removemaster` (×2) | เพิ่ม/ตัด/ถอด master prompt |
| `videoemphasis` | จุดเน้นเฉพาะวิดีโอ (motion cues) |
| `speechcap` (×2) / `dialogue4s` | คุมความยาวเสียงพูด/บทให้พอดี 4 วิ |
| `systemprompt` | ปรับ system prompt หลัก |
| `longtake` (×2) / `stillhold` / `scene4s` / `exactscenes` | long take, ค้างภาพนิ่ง, ล็อกความยาวฉาก 4 วิ, ระบุฉากเป๊ะ |
| `audiofix` | แก้เสียง/เสียงพากย์ |

---

## 🗓️ 31 ก.ค. (เย็น) – 2 ส.ค. — QC Engine

สร้างระบบ QC ตรวจ prompt แล้ววนแก้จนผ่านเกณฑ์

| งาน | แก้ตรงไหน |
|-----|-----------|
| `qc` / `promptqc` | ระบบ QC review → `apps/api/src/library/qc/` |
| `productsheet` | Product Sheet (vision) เป็น input ของ QC |
| `novacuum` | กันฉาก "สุญญากาศ" (ว่างเปล่า/ไม่มีสาระ) |
| `ironrules` | กติกาเหล็ก (iron rules) ที่ prompt ต้องผ่านทุกข้อ |
| `qcautofix` / `qcscope` / `deepqc` | QC auto-fix, กำหนดขอบเขต, QC เชิงลึก |
| `multipack` / `packselect` | รองรับหลายแพ็ก + เลือกแพ็ก |
| `noimprov` (×2) | ห้ามโมเดล "ด้นสด" นอกบท |

---

## 🗓️ 3 ส.ค. — Precision Fixes (รอบละเอียด)

ไล่แก้จุดเพี้ยนรายละเอียด โดยเฉพาะมือ/บท/เสียง

| งาน | แก้ตรงไหน |
|-----|-----------|
| `toothpaste` (×2) | เคสสินค้าเฉพาะ (ยาสีฟัน) |
| `apifix` (×2) | แก้ฝั่ง API/integration |
| `precision` (×2) / `scenelen` | ความแม่นยำ prompt + ความยาวฉาก |
| `audiofirst` | ให้เสียงมาก่อน (audio-first) |
| `aifix` / `magicfix` / `nocap` | แก้รวม + เลิกใส่ caption ในภาพ |
| `herofix` (×3) | แก้ hero shot สินค้า |
| `dialoglen` (×3) | คุมความยาวบทสนทนา |
| `solohands` / `handcheck` (×2) | คุม "มือเดียว/สองมือ" + ตรวจมือ (กันนิ้วเกิน) |
| `fixloop` / `fixall` / `smartloop` | ลูปแก้อัตโนมัติ + smart loop |
| `worklock` (×2) / `targetfix` | ล็อกงานระหว่างแก้ + แก้เป้าหมาย |
| `negall` (×2) / `negsort` / `speechlast` (×2) | จัด negative ครบชุด + เรียงลำดับ + วางเสียงพูดท้ายฉาก |

---

## 🗓️ 4 ส.ค. — Hand Allocation + QC รายละเอียดเต็ม

รอบสุดท้ายก่อนขึ้น repo

| งาน | แก้ตรงไหน |
|-----|-----------|
| `pkgsplit` / `negsplit` | แยกบล็อกแพ็กเกจ + แยก negative ภาพนิ่ง/วิดีโอ |
| `handalloc` (×2) | จัดสรรมือในฉาก (มือใครทำอะไร) |
| `qcsticky` | ทำแถบ QC ค้างบนหน้าจอ (sticky) |
| `qcalldetail` (×3) / `qcallfix` (×2) | QC ลงรายละเอียดครบทุกจุด + แก้ทั้งชุด |
| `ctanoaction` (×2) | CTA ปิดคลิปแบบไม่ต้องมี action เกินจำเป็น |
| `qcsection` (×2) | จัด QC เป็นหมวด (section) |

---

## สรุปผลรวม

- **ระบบ prompt:** แยกภาพนิ่ง/วิดีโอ, packaging ต่อสินค้า, สูตรรีวิวต่อประเภท, master prompt แบบ trim
- **ความปลอดภัย Flow:** Flow Policy Guard ตรวจ + auto-fix ให้ผ่าน content filter อัตโนมัติ
- **QC:** iron rules + วนแก้อัตโนมัติ (auto-fix loop) + ตรวจมือ/ความยาวบท/negative ครบชุด
- **AI:** OpenAI (Product Sheet vision, QC, ตัดบท) + Claude (Character wizard)

> โครงสร้างระบบ prompt/QC โดยละเอียด ดู [`_docs/STRUCTURE.md`](_docs/STRUCTURE.md)
