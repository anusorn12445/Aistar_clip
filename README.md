# AISTAR Talent OS

ระบบบริหารจัดการการผลิตคอนเทนต์ AI Talent / AI Character / AI Short Drama / AI Live Commerce

## เอกสาร

- [`_docs/aistar_talent_os_srs_prd_v0_1.md`](_docs/aistar_talent_os_srs_prd_v0_1.md) — SRS/PRD หลัก
- [`_docs/aistar_talent_os_prd_review_v0_1.md`](_docs/aistar_talent_os_prd_review_v0_1.md) — ผลรีวิว 6 มุมมอง + Decision Log D1–D10
- [`_docs/aistar_talent_os_srs_prd_v0_2_addendum.md`](_docs/aistar_talent_os_srs_prd_v0_2_addendum.md) — spec เพิ่มเติม v0.2 (permission matrix, state machine, data model, MCP security)

## โครงสร้าง

```text
apps/api   NestJS + Prisma + PostgreSQL (port 4000, prefix /api)
apps/web   Next.js + Tailwind (port 3000)
```

## เริ่มใช้งาน

```bash
brew services start postgresql@16   # ถ้ายังไม่รัน
pnpm install
pnpm --filter api prisma:migrate    # สร้างตาราง
pnpm --filter api prisma:seed      # 14 roles + permission matrix + admin + platforms
pnpm dev:api                        # NestJS :4000
pnpm dev:web                        # Next.js :3000
```

Login แรก: `admin@aistar.local` / `aistar-admin-2026` (เปลี่ยนรหัสก่อนใช้งานจริง)

## สถานะ Phase 1

- [x] Auth (email+password, JWT) + RBAC 14 roles ตาม Permission Matrix
- [x] Character CRUD + display code (CHR-XXX-001) + state machine + optimistic lock
- [x] Version snapshot (entity_versions) + Audit log
- [x] Web: login + character list/create + character detail
- [x] AI Character Wizard — `POST /ai/characters/draft` (Claude claude-opus-4-8, guardrails §G.2, ต้องตั้ง `ANTHROPIC_API_KEY` ใน apps/api/.env)
- [x] Asset Gallery — upload + link + primary reference + status workflow + gallery UI
- [x] Prompt Library — platform-agnostic (Grok/Kling/Veo/...) + versions + generation runs + UI
- [x] Export Package — ZIP ตามโครง §8.3 (background job + download log)
- [x] MCP server — `packages/mcp` (read + draft_write เท่านั้น ตาม D8) — ดู packages/mcp/README.md
- [x] E2E tests — `pnpm --filter api test:e2e` (ใช้ database aistar_test แยก)

## MCP Server

```bash
pnpm --filter @aistar/mcp build
# ดูวิธีตั้งค่า token และเพิ่มเข้า Claude ที่ packages/mcp/README.md
```
