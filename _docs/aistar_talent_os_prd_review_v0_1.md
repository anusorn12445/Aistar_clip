# AISTAR Talent OS — PRD Review Report
## รีวิวโดยทีมพัฒนา 6 มุมมอง (Architect, Backend/DB, Frontend/UX, Security/DevOps, QA/Product, AI/MCP)

**เอกสารที่รีวิว:** `aistar_talent_os_srs_prd_v0_1.md`
**วันที่รีวิว:** 2026-07-11

---

# ✅ Decision Log (เคาะโดยพี่ทัศน์ — 2026-07-11)

| # | เรื่อง | คำตัดสิน | ผลกระทบ |
|---|---|---|---|
| D1 | PDPA | **ตัดออก ไม่ทำ** | ตัด Critical #5 ทิ้งทั้งข้อ |
| D2 | SaaS / Multi-tenancy | **ไม่ทำ SaaS — ทีม AISTAR ใช้ภายในเท่านั้น** | ไม่ต้องมี `workspace_id`, single-tenant deployment, ตัดคำถาม tenancy ออก |
| D3 | ผู้ใช้ระบบ | **หลายคนในทีม AISTAR** (ไม่ใช่ single user) | Roles + Permission Matrix + Approval workflow **ยังต้องมี** ตาม PRD |
| D4 | AI Video Platform | **ใช้หลาย platform รวมถึง Grok — อนาคตมีอะไรใหม่ก็จะใช้** | Prompt Library ต้องออกแบบ platform-agnostic: field `target_platform`, `model_version`, `generation_params (json)` ห้าม hardcode platform ใดๆ |
| D5 | Obsidian Sync | **ตัดออกจาก Phase 1 ไปก่อน** (เลื่อน ไม่ใช่ยกเลิก) | Phase 1 เบาลง — เหลือ Export Markdown/JSON ธรรมดา (ดาวน์โหลดไฟล์) ซึ่งพอสำหรับเอาไปเปิดใน Obsidian เองได้ |
| D6 | Performance Data | **Manual entry + CSV import พอ** ไม่ต้องรอ platform API | Phase 3 effort ลดมาก — ออกแบบ UX กรอกเร็ว + CSV mapping spec |
| D7 | Tech Stack | **NestJS (API + workers) + Next.js (frontend)** | Node ecosystem ทั้งระบบ — MCP server ใช้ codebase เดียวกัน, BullMQ สำหรับ background jobs |
| D8 | สิทธิ์ AI (MCP/GPT) Phase 1 | **Read + สร้าง/แก้ draft เท่านั้น** | AI ห้ามมี tool approve / publish / rollback / delete — enforce ฝั่ง server ตาม guardrail §28.2 |
| D9 | Authentication | **Email + Password** | ต้องมี password policy, reset flow, session revocation — ระบุใน v0.2 |
| D10 | ข้อมูลเดิม | **ไม่ทำ import tool — กรอกใหม่ผ่าน AI wizard** | ตัด migration scope ทิ้ง, AI wizard ของ Character คือ onboarding path หลัก |

---

# คำตัดสินภาพรวม

ทั้ง 6 ทีมเห็นตรงกัน: **PRD v0.1 เป็น "Product Definition" ที่แข็งแรงมาก (~80% ฝั่ง domain model)** — modules, fields, status ครบและคิดมาดี **แต่ยังไม่ใช่ SRS ที่เริ่ม dev ได้ทันที** เพราะขาดชั้น "การตัดสินใจ" ที่เชื่อม feature list ให้เป็นระบบจริง: ไม่มี permission matrix, ไม่มี state machine, ไม่มี UX spec, ไม่มี security/PDPA spec, และส่วน AI/MCP ที่เป็นหัวใจของ product ยังเป็น wish list ไม่ใช่ spec

**คำแนะนำ:** ออก **PRD v0.2** ปิด gap ระดับ Critical ก่อน (ประมาณ 1–2 สัปดาห์ของงาน design/decision) แล้วค่อยเริ่ม Sprint แรก — ถูกกว่า rework ระดับเดือนใน Phase 2–3

---

# Top 10 สิ่งที่ตกหล่นระดับ Critical (หลายทีมชี้ตรงกัน)

## 1. มี 14 Roles แต่ไม่มี Permission Matrix ❗ (4 ทีมชี้ตรงกัน)
Section 3.1 ลิสต์ role ครบ แต่ไม่มีตาราง role × module × action (view/create/edit/approve/export/delete) เลย นี่คือ **business decision ไม่ใช่งาน dev** — ถ้าปล่อยให้ dev เดาจะได้ over-permission แน่นอน คำถามเร่งด่วน: ใคร export Character Package ได้? ใครเห็น Prompt Library เต็ม? ใคร approve Rights?
**แก้:** ทำ permission matrix เป็น appendix ของ SRS ยึดหลัก least privilege โดยแยก `export`/`download` ออกจาก `view`

## 2. Status เป็นแค่รายการ — ไม่มี State Machine / Transition Rules (3 ทีม)
Content Status มี 18–19 สถานะ (§21.5) แต่ไม่รู้ว่าใครย้าย state ไหน→ไหนได้ ย้อนกลับได้ไหม transition ไหน trigger warning และ §21.4 แยก `approval_status` กับ `publishing_status` เป็น 2 fields แต่ §21.5 ให้ list เดียวปนกัน — ขัดแย้งกันเอง ปัญหาเดียวกันเกิดกับทั้ง 8 ชุด status ในเอกสาร
**แก้:** State transition diagram + role matrix ต่อ entity เริ่มจาก Content/Approval และยุบ status ที่ทับซ้อน (`hold`/`blocked`/`cancelled`/`rejected` → status เดียว + reason field)

## 3. Module ที่ประกาศใน scope แต่ไม่มี spec (QA + Backend)
- **Production Handoff** — อยู่ใน scope ข้อ 7 (§4.1) และ Phase 2 แต่ไม่มีนิยามเลยว่าคืออะไร (เลข module ยังชนกับ Campaign ด้วย)
- **Products / Brands** — มี table ใน DB, ถูก reference จาก 5+ modules (campaign, episode, live, performance) แต่**ไม่มี module spec สักบรรทัด** ทั้งที่เป็นหัวใจของ commerce
- **ไม่มี Task system จริง** — assign งานได้ทางเดียวคือ Post-it, มี MCP tool `convert_postit_to_task` แต่**ไม่มีตาราง tasks** — AI Video Operator ไม่มีทางรู้ว่าวันนี้ต้องทำ shot ไหน
- **Notification module ไม่มี** — ทั้งที่ requirement อ้าง "ระบบเตือน" หลายจุด (§27.5, §30 ข้อ 7, reminder ของ live)
- **Dashboard ไม่อยู่ใน 22 modules** — แต่ NFR กำหนด "load ภายใน 3 วิ" (§27.2)

## 4. MCP/GPT ไม่มี Security Model + ยังไม่เลือก integration path (3 ทีม)
MCP tools 70+ ตัวรวม tool ทำลายล้าง (`rollback`, `archive`, `update_*`) โดยไม่มี auth model, ไม่ scope ตาม RBAC, ไม่มี rate limit — เสี่ยงเป็น God-mode API และ "GPT Actions / Custom GPT" กับ "MCP Server" เป็นคนละสถาปัตยกรรม ถูก list คู่กันโดยไม่ตัดสินใจ ทั้งยังเปิด attack surface: Idea Library "Paste URL + AI summarize" = ช่อง prompt injection ที่ LLM ตัวเดียวกันมีสิทธิ์เรียก write tools
**แก้:** MCP เป็น primary (open standard, ChatGPT ก็รองรับแล้ว), token ผูก user identity สืบทอด RBAC, แยก read/write scope, destructive action ต้องมี human-in-the-loop **ฝั่ง server** และ AI ห้ามมี tool เปลี่ยน approval_status (ตรงกับ guardrail §28.2 ที่ยังไม่มีกลไก)

## 5. ~~ไม่มี PDPA เลยทั้งฉบับ~~ — ❌ ตัดออกตาม Decision D1
~~ระบบเก็บข้อมูลส่วนบุคคล: voice sample, ข้อมูล creator/KOL คู่แข่ง~~ พี่ทัศน์ตัดสินใจไม่ทำเรื่อง PDPA — ข้ามทั้งข้อ (คงไว้เพียง note: สัญญา voice actor เรื่องสิทธิ์ AI voice clone ยังควรมีในมุมสัญญาจ้าง/IP ซึ่งอยู่ใน Module 12 Rights อยู่แล้ว)

## 6. IP Protection ไม่มีกลไก — Obsidian Sync คือช่องรั่วใหญ่สุด (Security + Architect)
Prompt + Visual DNA + Character Bible = trade secret ทั้งบริษัท แต่ Module 4 ให้ export ZIP ง่ายๆ และ Obsidian Sync mirror ทุกอย่างเป็น plain markdown บนเครื่อง local ที่ควบคุมไม่ได้ — พนักงานลาออกพร้อม vault = IP หลุดทั้งก้อน อีกทั้ง sync semantics ขัดแย้งกันเอง (§31.1 บอก one-way แต่ §30 ข้อ 12 บอก GPT "แก้" ได้) และไม่รู้ vault อยู่ที่ไหน conflict ใครชนะ
**แก้:** ล็อก one-way (DB = source of truth), จำกัดสิทธิ์ sync/export ต่อ role, log + watermark ทุก export, ระบุ template markdown + wikilink convention (ยังไม่มีตัวอย่างสักไฟล์)

## 7. Prompt Library ไม่ผูกกับ generation platform / model version (AI/MCP)
ไม่ระบุว่าใช้ platform ไหน (Midjourney/Kling/Runway/Veo...) ทั้งที่ prompt format ต่างกันมาก และไม่มี field `target_platform`, `model_version`, `generation_params`, `seed` — เมื่อ platform ออก version ใหม่ (ทุก 2–3 เดือน) prompt ที่ approved จะให้ผลเพี้ยนโดยระบบไม่รู้ **ทำลาย objective หลักของ module ("ลดปัญหาหน้าหลุด") โดยตรง** และ chain prompt version → asset → QC score → performance ไม่มี schema รองรับ ทำให้ Phase 4 (AI recommendation) ไม่มี training signal
**แก้:** เพิ่ม fields ดังกล่าว + entity `prompt_generation_runs` และเก็บ image embedding ของทุก approved asset ตั้งแต่ Phase 1 (ไม่งั้น Phase 4 similarity checker ต้อง backfill ทั้ง gallery)

## 8. Performance Data ไม่รู้เข้าระบบทางไหน + ไม่ใช่ time-series (3 ทีม)
Module 13 คือหัวใจของ "data loop" แต่ auto-posting/scraping อยู่นอก scope — แล้วข้อมูลมาจากไหน? manual? CSV? platform API? และ `performance | object` เป็น field เดียวเก็บค่าเดียว ทั้งที่ views/GMV เปลี่ยนทุกวัน
**แก้:** MVP = manual entry + CSV import (ออกแบบ UX ให้กรอกเร็ว), `content_performance` เป็น snapshot rows (recorded_at) และถ้าต้องการ platform API ต้องเริ่มขอ access ตั้งแต่ตอนนี้ (lead time หลายเดือน)

## 9. Data Model ยังมีรูใหญ่ (Backend)
- Prompt และ Asset เป็น entity ผูก character เท่านั้น (`character_prompts`, `character_assets`) แต่ features ต้องการ link ไป shot/campaign/episode — ต้องเป็น entity กลาง + polymorphic links
- Version Control ไม่ระบุ snapshot strategy (full copy vs diff? rollback แล้ว link ชี้ไปไหน?)
- Enum เกินครึ่งไม่ define ค่า, relationship เป็น loose string แทน FK (series/episode/campaign) — ทำให้ join กับ performance loop ไม่ได้จริง
- ไม่มี REST API spec, pagination, presigned upload, asset metadata (size/duration/checksum/dedup)
- ตารางหาย: `tags`, `tasks`, `export_jobs`, `notifications`, `download_logs`, `qc_checklists`, price history

## 10. ไม่มี UX Spec เลยแม้แต่หน้าเดียว (UX)
ไม่มี wireframe/user flow/sitemap — เสี่ยง dev แปลง data model เป็น "form ยาว + table" ซึ่งขัดกับ §27.5 เอง โดยเฉพาะ:
- **Character ~50 fields vs "Form ต้องสั้น"** — ต้อง resolve ด้วย wizard: กรอกขั้นต่ำ 3 fields → AI generate draft → review ทีละ section
- **4 flows ที่ห้ามให้ dev เดา:** Character Creation Wizard, Shot List Builder, Content Calendar (8 views!), QC Review
- IA สำหรับ 22 modules (จัดกลุ่ม + role-based landing), Mobile สำหรับ quick-add idea (use case เกิดบนมือถือ 100%), ภาษา UI (Thai + English technical terms), Dashboard ต่อ role

---

# ประเด็นสำคัญรองลงมา (Should-have)

| ประเด็น | ทีมที่ชี้ | สรุป |
|---|---|---|
| ~~Multi-tenancy~~ | Architect, Backend | ✅ **ตัดสินใจแล้ว (D2): ไม่ทำ SaaS** — single-tenant, ไม่ต้องมี `workspace_id` และควรแก้ §1.3 ใน PRD ที่เขียนว่า "ต่อยอดเป็น SaaS" ให้ตรงกัน |
| Job Queue / Async | Architect, AI/MCP | export, AI generate, Obsidian sync, transcoding ล้วนเป็น async แต่ architecture เป็น linear stack — ต้องมี queue + worker ตั้งแต่ Phase 1 |
| Thai Full-text Search | Architect | PostgreSQL FTS ตัดคำไทยไม่ได้ — ควรใช้ Meilisearch/Typesense ตั้งแต่แรก |
| Authentication | Security | ไม่มี spec เลย — แนะนำ SSO Google Workspace + MFA สำหรับ role สำคัญ |
| Backup RPO/RTO | Security | "Backup database" เฉยๆ ไม่พอ — กำหนด RPO ≤ 24 ชม., restore drill, PITR |
| Signed URLs | Security | asset ต้องเป็น private bucket + short-lived signed URL ไม่งั้น leak ด้วย link เดียว |
| AI Guardrails | AI/MCP, QA | §28.2 เป็น policy ล้วน — ต้องแปลงเป็น enforcement matrix (rule-based claim check ตามกฎ อย., similarity check, human QC checkpoint) |
| LLM Strategy & Cost | AI/MCP | 15+ จุดเรียก LLM ไม่ระบุ provider/model tier/budget — ควรมี gateway + metering |
| Phase 1 scope creep | QA | Obsidian Sync + MCP จริงควรเลื่อนเป็น Phase 1.5 — Phase 1 เหลือ Character + Asset + Prompt + Export ก็พิสูจน์ value ได้ |
| Migration & Adoption | QA | ข้อมูลเดิมใน spreadsheet/แชต ต้องมี import tool + pilot 1 series — ระบบแบบนี้ล้มเพราะ adoption บ่อยกว่า bug |
| Acceptance Criteria | QA | Success criteria วัดไม่ได้ — ต้องมี Given/When/Then ต่อ feature Phase 1 + end-to-end use case walkthrough 3–5 เรื่อง |
| Deployment/Observability | Architect, Security | ไม่มี env/CI-CD/secrets/monitoring spec — ขั้นต่ำ staging+prod, Sentry, structured logs |

---

# คำถามที่พี่ทัศน์ต้องเคาะก่อนเริ่ม Dev (รวมจากทุกทีม)

## เชิงกลยุทธ์
1. ~~**Tenancy**~~ ✅ ตอบแล้ว (D2): ไม่ทำ SaaS — single-tenant
2. ~~**Phase 1 scope**~~ ✅ ตอบแล้ว (D5): ตัด Obsidian ออกจาก Phase 1
3. ~~**Performance data**~~ ✅ ตอบแล้ว (D6): manual + CSV import
4. ~~**ข้อมูลเดิม/migration**~~ ✅ ตอบแล้ว (D10): กรอกใหม่ผ่าน AI wizard ไม่ทำ import tool

## เชิงเทคนิค
5. ~~**Stack**~~ ✅ ตอบแล้ว (D7): NestJS + Next.js, REST
6. ~~**MCP**~~ ✅ ตอบแล้ว (D8): MCP primary, AI = read + draft เท่านั้น ห้าม approve/publish/rollback/delete
7. **LLM provider + budget:** ใช้เจ้าไหน, cost ceiling ต่อเดือนเท่าไหร่?
8. ~~**AI video platforms**~~ ✅ ตอบแล้ว (D4): หลาย platform รวม Grok, เปิดรับตัวใหม่เสมอ → Prompt Library เป็น platform-agnostic

## เชิง Governance
9. **Permission:** ใครเป็นเจ้าของการเคาะ permission matrix? 3 ข้อเร่งด่วน: ใคร export package ได้ / ใครเห็น prompt เต็ม / ใคร sync Obsidian ได้
10. ~~**PDPA**~~ ✅ ตอบแล้ว (D1): ตัดออก ไม่ทำ
11. ~~**Auth**~~ ✅ ตอบแล้ว (D9): Email + Password
12. **RPO/RTO:** ยอมเสียข้อมูลได้กี่ชั่วโมง ระบบล่มได้นานสุดเท่าไหร่ (โดยเฉพาะช่วง Live)?

---

# แผนที่แนะนำ: PRD v0.2 ก่อน Sprint 1

**สัปดาห์ที่ 1 — Decisions & ADRs**
- เคาะคำถามที่เหลือ 10 ข้อ (ข้อ 1 tenancy และข้อ 10 PDPA ตอบแล้ว) → เขียน Architecture Decision Records 4 เรื่อง: job queue, Obsidian sync semantics, asset pipeline, MCP auth

**สัปดาห์ที่ 2 — Spec เพิ่มใน v0.2**
1. Permission matrix (role × module × action)
2. State machine ของ Content + Approval (ลด 19 states เหลือ ~8–10)
3. Spec ที่หายไป: Product/Brand Catalog, Production Handoff (หรือประกาศตัด), Task entity, Notification service
4. Security section: Auth, Audit log spec, Backup/DR, Signed URLs (PDPA ตัดออกตาม D1)
5. AI section: MCP Security Model, LLM Strategy, Guardrail Enforcement Matrix, Prompt schema (+platform/model version)
6. UX definition sprint: sitemap, wireframe 4 flows หลัก (Character wizard, Shot List Builder, Calendar, QC Review)
7. Acceptance criteria Phase 1 + end-to-end use case walkthrough 1 เรื่อง ("ผลิต 1 episode จนโพสต์และเก็บผล")
8. Enum registry + ERD จริง (แก้ polymorphic links, FK แทน string, asset metadata)

จบสองสัปดาห์นี้แล้วเริ่ม Sprint 1 (Character CRUD + Asset upload + Prompt Library) ได้อย่างมั่นใจ

---

*รายงานนี้สังเคราะห์จากรีวิวอิสระ 6 ฉบับ — รายละเอียดเต็มของแต่ละมุมมองสามารถขอดูเพิ่มได้*
