# AISTAR Talent OS — Development Plan

**วันที่:** 2026-07-11 · **อ้างอิง:** PRD v0.1 + Review + Addendum v0.2 (Decision D1–D10)

---

# ✅ เสร็จแล้ว (Sprint 0 — Foundation)

| งาน | สถานะ |
|---|---|
| รีวิว PRD 6 มุมมอง + Decision Log D1–D10 | ✅ |
| PRD v0.2 Addendum (permission matrix, state machine, data model, MCP security) | ✅ |
| Monorepo: NestJS API + Next.js web + PostgreSQL | ✅ |
| Database migration แรก — 22 ตาราง + seed (14 roles, permission matrix, 6 platforms, admin) | ✅ |
| Auth (JWT) + RBAC guard ตาม Permission Matrix | ✅ |
| Character CRUD + display code + state machine + optimistic lock + audit log | ✅ |
| Web: Login + Character list/create | ✅ ทดสอบผ่านหน้าเว็บจริง |

# 🔄 กำลังทำ (Sprint 1 — Phase 1 Core, ทีม agent 5 คนขนานกัน)

| Workstream | เนื้อหา |
|---|---|
| **Asset Gallery** | Upload (local storage + sha256), link asset ↔ entity, primary reference, status workflow, หน้า character detail + gallery |
| **Prompt Library** | Prompt + versions (platform-agnostic ตาม D4 — รองรับ Grok และ platform ใหม่ๆ), generation runs + QC score chain, หน้า /prompts + copy button |
| **Export Package** | ZIP (character bible MD + prompt pack + JSON) แบบ background job + download log |
| **AI Character Wizard** | POST /ai/characters/draft — Claude (claude-opus-4-8) ร่าง Persona/Visual DNA/Commerce Profile จาก 3 ช่อง พร้อม guardrails §G.2 |
| **MCP Server** | stdio server: read + draft_write เท่านั้น (D8) — ให้ Claude/GPT ค้น-สร้าง draft ผ่าน API ได้ |

**งาน integrate (Franky ทำเอง):** รวม modules เข้า app.module, wire ปุ่ม AI wizard + export + ลิงก์หน้า detail, เขียน+รัน e2e tests, ทดสอบผ่านเว็บจริง

**สิ่งที่ต้องได้จากพี่ทัศน์:** `ANTHROPIC_API_KEY` ใส่ใน `apps/api/.env` เพื่อเปิดใช้ AI Wizard (ระบบอื่นทำงานได้โดยไม่ต้องมี)

# ✅ Sprint 2 — เสร็จแล้ว (2026-07-11)

1. ✅ User Management UI + Roles
2. ✅ Refresh token (rotate + revoke) + change password
3. ✅ Global Search ข้ามทุก entity + filter ครบทุก list (URL-synced) — ใช้ SQL ILIKE, Meilisearch เป็น upgrade ภายหลังถ้า scale
4. ✅ Notification in-app + bell + triggers
5. ✅ My Work board
6. ✅ Performance Dashboard (Character ไหนขายดีสุด / Platform ไหนเวิร์ค)
7. ✅ AppShell sidebar navigation ทุก module

# ✅ Phase 2 — Production Pipeline — เสร็จแล้ว (2026-07-11)

1. ✅ Product/Brand Catalog (claim risk + restricted claims)
2. ✅ Campaign (state machine + link characters/products)
3. ✅ Series / Episode / Script (auto version snapshot)
4. ✅ Shot List Builder + AI แตก shot อัตโนมัติ (ทดสอบจริง: 8 shots จาก script)
5. ✅ Production Handoff — auto-create tasks + notifications
6. ✅ Location Library, Voice Profile, Rights (legal state machine)
7. ✅ QC Module — 9 categories + summary per entity

# ✅ Phase 3 — Publishing & Intelligence — เสร็จแล้ว (2026-07-11)

1. ✅ Content Calendar — 9-state machine + readiness check + month/week/list views
2. ✅ Live Commerce Schedule (pin products + target GMV)
3. ✅ Performance — manual + CSV import + dashboard GMV ต่อ character
4. ✅ Idea Library (+AI สกัด pattern) + Post-it Board (kanban + convert-to-task)
5. ✅ Competitor Intelligence — Fact/Assumption/Recommendation แยกช่อง + convert เป็น campaign
6. ⏳ LINE OA notification — backlog (in-app notification ใช้ได้แล้ว)
7. ✅ Obsidian vault export (ZIP + wikilinks)

# ✅ Phase 4 — Advanced Intelligence — เสร็จแล้ว (2026-07-11)

- ✅ AI Shot List Generator (claude-opus-4-8)
- ✅ AI Caption + hashtags — hard guardrail กัน restricted claims (ทดสอบจริงผ่าน)
- ✅ AI Asset QC — Claude vision ตรวจ consistency กับ Visual DNA + anti-clone rules
- ✅ Character Similarity Checker (text-based v1)
- ✅ AI Weekly Content Plan
- ⏳ Competitor alert + performance recommendation อัตโนมัติ — backlog (ต้องการข้อมูลสะสมก่อน)

# 🔧 Infra Track (ทำแทรกตามจังหวะ)

| งาน | เมื่อไหร่ |
|---|---|
| Git commit + remote repo | ทันทีที่ Sprint 1 เสร็จ |
| PostgreSQL backup (pg_dump cron รายวัน) | ก่อนทีมเริ่มใช้จริง |
| Deploy ขึ้น server จริง (Docker) + HTTPS | ปลาย Sprint 2 — ทีมเข้าใช้พร้อมกัน |
| Redis + BullMQ (แทน in-process jobs) | Phase 2 — เมื่อ export/AI batch หนักขึ้น |
| Object storage R2/S3 (แทน local disk) | Phase 2 — StorageService ออกแบบสลับได้แล้ว |
| Sentry + monitoring | พร้อม deploy |

# เกณฑ์ "Phase 1 เสร็จ" (จาก Acceptance Criteria §J)

- [x] สร้าง character จาก 3 ช่อง (AC-1 บางส่วน — รอ AI wizard)
- [x] Approve โดยไม่มี primary reference โดน block (AC-2)
- [ ] Upload asset 200MB + thumbnail ใน gallery (AC-3)
- [x] Role ไม่มีสิทธิ์ E มองไม่เห็น/ใช้ export ไม่ได้ (AC-4)
- [x] MCP แก้ non-draft ได้ 403 + audit `via=mcp` (AC-5 — enforce แล้ว รอ MCP client ทดสอบจริง)
- [ ] ค้น prompt เจอใน 2 วิ + copy คลิกเดียว (AC-6)
- [ ] Export ZIP ตามโครง §8.3 + download log (AC-7)
