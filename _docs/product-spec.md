---
title: AISTAR Talent OS — Product Spec (System of Record)
version: 1.0
status: living-document (Single Source of Truth)
lastUpdated: 2026-07-21
method: reverse-engineered จากโค้ดจริง — apps/api (NestJS 33 modules), apps/web (Next.js ~40 routes), extension/aistar-flow, prisma/schema.prisma (2,152 บรรทัด / 37 migrations)
owner: Nat
relatedDocs:
  - product-brief.md (กลยุทธ์: ทำไม/ให้ใคร/ไปทางไหน)
---

# AISTAR Talent OS — Product Spec

> **เอกสารนี้คืออะไร:** System of Record เชิงเทคนิค/ฟังก์ชัน — *ระบบทำงานยังไงจริง ๆ* ทุกส่วนอ้างอิง path ในโค้ดเพื่อยึดกับความจริง (เมื่อโค้ดเปลี่ยน อัปเดตส่วนที่เกี่ยว) ใช้คู่กับ [`product-brief.md`](./product-brief.md)
>
> **กติกา SSOT:** เอกสารนี้สะท้อน *ระบบที่สร้างแล้ว* ถ้าขัดกับ PRD v0.1/v0.2 → ยึดเอกสารนี้ (PRD เก่า = historical)

## สารบัญ

1. [สถาปัตยกรรมระบบ](#1-สถาปัตยกรรมระบบ-architecture)
2. [Auth & RBAC](#2-auth--rbac)
3. [Data Model](#3-data-model)
4. [โมดูลฟังก์ชัน (ตามผังเมนู)](#4-โมดูลฟังก์ชัน-ตามผังเมนู)
5. [AI Integration (Claude)](#5-ai-integration-claude)
6. [AI Cost Accountability](#6-ai-cost-accountability)
7. [Compliance & Governance](#7-compliance--governance)
8. [Content Intelligence Loop](#8-content-intelligence-loop)
9. [Assets & Storage](#9-assets--storage)
10. [Chrome Extension (AISTAR → Flow)](#10-chrome-extension-aistar--flow)
11. [Cross-cutting: Notifications / Audit / Search / Export / Versioning](#11-cross-cutting)
12. [End-to-End Workflows](#12-end-to-end-workflows)
13. [สถานะ Implement / Gaps / Open Questions](#13-สถานะ-implement--gaps--open-questions)
14. [Local Dev Setup](#14-local-dev-setup)

---

## 1. สถาปัตยกรรมระบบ (Architecture)

**Monorepo** (pnpm workspace, `pnpm-workspace.yaml`) 3 ส่วน + packages:

```
aistar-talent-os/
├─ apps/api        NestJS + Prisma  (REST, global prefix /api)
├─ apps/web        Next.js 16 App Router (Turbopack)
├─ extension/aistar-flow   Chrome MV3 side-panel extension (v1.6.0)
├─ packages/       shared code
└─ _docs/          เอกสาร (SSOT อยู่ที่นี่)
```

| ชั้น | เทคโนโลยี | หมายเหตุ |
|---|---|---|
| **API** | NestJS 11, Prisma 6, PostgreSQL | 33 modules, global `ValidationPipe({whitelist, transform})`, CORS ตาม `CORS_ORIGIN`, ฟังที่ `0.0.0.0:${PORT|4000}` |
| **Web** | Next.js 16 (App Router, Turbopack), React | dark theme (`bg-zinc-950` + amber-400 accent), Thai-first UI |
| **AI** | Anthropic Claude (`@anthropic-ai/sdk`) | model default `claude-opus-4-8`, config ได้ที่ Settings หรือ env |
| **Storage** | Cloudflare R2 (S3-compatible) หรือ local disk | เลือกอัตโนมัติตาม config; วิดีโอใช้ Google Drive link |
| **Search** | SQL ILIKE | Meilisearch = upgrade ทีหลัง |
| **Deploy** | Railway (Dockerfile.api, Dockerfile.web) | ดู `DEPLOY_RAILWAY.md` |

**Env vars สำคัญ** (`.env.example`):
- `DATABASE_URL` — Postgres connection
- `JWT_SECRET` — **จำเป็น** (`getOrThrow` — ไม่มี = API ไม่ start)
- `CORS_ORIGIN` — โดเมน web (คั่น comma ได้)
- `STORAGE_DIR` — โฟลเดอร์เก็บไฟล์ (local mode, default `./storage`)
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` — ตั้งที่นี่หรือหน้า Settings (DB ทับ env)
- `NEXT_PUBLIC_API_URL` (web) — โดเมน API + `/api`, ต้องมีตอน build (Next inline)

**การเชื่อม web ↔ api** (`apps/web/src/lib/api.ts`):
- `API_BASE = NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"`
- helper `api<T>(path, options)` ครอบ `fetch` ทั้งหมด (JSON + prefix)
- **Auth:** Bearer JWT ใน `localStorage.aistar_token`, refresh ใน `aistar_refresh`, user cache ใน `aistar_user`
- **401 handling:** single-flight refresh (`POST /auth/refresh` dedup) → retry 1 ครั้ง → ถ้าพังล้าง token + redirect `/login`
- `ApiError` เก็บ HTTP status (ให้ caller เช็ค 503 = AI ไม่พร้อม ได้)

---

## 2. Auth & RBAC

### 2.1 Login / JWT / Refresh (`apps/api/src/auth`)
- รหัสผ่าน hash ด้วย **bcryptjs**
- `login()` → เช็ค active + bcrypt → `issueTokens()`: access JWT (`{sub, email, roles}`, เซ็นด้วย `JWT_SECRET`) + refresh token สุ่ม 32-byte (เก็บเฉพาะ **sha256 hash** ใน `RefreshToken`)
- **Rotating refresh** (TTL 7 วัน): `refresh()` revoke ตัวเก่า ออกคู่ใหม่; `logout()` + `changePassword()` revoke (เปลี่ยนรหัส = เตะทุก session)
- `JwtStrategy` (passport-jwt, Bearer) → `req.user = {id, email, roles}`

**Routes** (`/auth`): `POST /login`, `POST /refresh`, `POST /logout`, `GET /me`, `PATCH /me`, `POST /change-password`

### 2.2 Roles (15) — seed `prisma/seed.ts`
`admin` · `founder` · `creative_lead` · `character_designer` · `creator` · `script_writer` · `prompt_engineer` · `ai_video_operator` · `video_editor` · `content_planner` · `publisher` · `commerce_lead` · `qc_reviewer` · `researcher` · `dev_api`

ผู้ใช้ถือได้หลาย role → permission = **union** ข้าม role (`effectivePermissions`)

**Admin login (seed):** `admin@aistar.local` / `aistar-admin-2026`

### 2.3 Permission Matrix — action model V/C/A/P/E/X
เก็บใน `RolePermission` ต่อ role ต่อ module: `actions[]` + `viewScope`

| action | ความหมาย |
|---|---|
| **V** | View |
| **C** | Create/Edit |
| **A** | Approve *(ต้องเป็นมนุษย์เท่านั้น)* |
| **P** | Publish |
| **E** | Export |
| **X** | Admin (เช่น hard-delete) |

**Modules ที่ gate:** `content, episode, product, job, campaign, image_request, live, performance, idea, postit, competitor, ai_usage, user, setting, library`

**การบังคับใช้:**
- `JwtAuthGuard` (auth) + `PermissionsGuard` ที่ระดับ controller เกือบทุกโมดูล
- `@RequirePermission(module, action)` → `PermissionsGuard` เช็ค `rolePermission.count` **live ทุกครั้ง** (ไม่ cache — แก้สิทธิ์มีผลทันที) ; route ที่ไม่มี metadata = auth-only
- แก้ matrix ตอน runtime ได้: `PATCH /roles/:key/permissions/:module`

### 2.4 Row-level View Scope (`ScopeService`)
- ค่า `all | team | own` — **most-permissive-wins** ข้าม role
- Phase 1 scope เฉพาะ module `content` และ `episode` (catalog อื่น share ทั้งทีม, `SCOPED_MODULES`)
- `team` → ขยายเป็น user ที่อยู่ทีมเดียวกัน (`getVisibleUserIds`)
- `GET /auth/me` คืน `viewScope` ต่อ module → UI แสดง badge ("🔒 เฉพาะงานคุณ" / "👥 เฉพาะทีม")
- list/search/calendar กรองตาม scope นี้

### 2.5 Guardrails สำคัญ (บังคับที่ server)
- **AI ห้ามอนุมัติเอง:** `changeStatus` (prompts/characters/episodes/content) reject ถ้า transition ไป `approved` เมื่อ `via !== 'ui'` → 403 + audit ; ผู้อนุมัติต้องมี action `A` ด้วย
- **Finance gate:** `FINANCE_ROLES = ['admin','founder']` เท่านั้นที่เห็นต้นทุน/GMV/ROI (ใน `ai-usage`, `dashboard`, `content-intelligence/roi`)
- **Admin override:** ตัดสินใจแก้/ลบ cross-user ด้วย `user.roles.includes('admin')`

### 2.6 Menu gating (frontend `AppShell.tsx`)
- `adminOnly` → เฉพาะ role `admin` (ตอนนี้มีแค่ Dashboard)
- `perm: <module>` → เมนูโชว์ถ้า profile ให้ action `V` บน module นั้น
- **Fail-open:** ระหว่าง permission โหลด/พัง → โชว์ทุกเมนู (`canSee` คืน true ถ้า `!profile?.permissions`)
- **Role landing:** login/logo → `admin ? /dashboard : /my-work` ; root `/` → redirect `/dashboard` ; non-admin เข้า `/dashboard` ตรง ๆ โดน bounce ไป `/my-work`

---

## 3. Data Model

PostgreSQL + Prisma, ~80 models. **Conventions** (addendum §F):
- **UUID PK** + `displayCode` แยก (เช่น `CHR-PRAEWA-001`, `PRD-0001`, `CLIP-0001`, `EP-0001`, `JOB-0001`, `ITPL-0001`, `DIR-0001`)
- **Polymorphic links** แบบ `entityType + entityId` (ไม่มี FK) — pattern "additive, ไม่แตะตารางเดิม": `AssetLink, PromptLink, EntityTag, EntityVersion, QcReview, Right, AuditLog, Notification, Postit, AiUsageLink`
- หลาย field owner (`createdBy, uploadedBy, ownerId`) เป็น bare `Uuid` ไม่มี relation (ตั้งใจ ไม่ผูก User)
- **Versioning:** snapshot JSONB เต็ม (`EntityVersion`) + rollback = copy เป็น version ใหม่

### 3.1 Domain Map (จัดกลุ่ม)

| Domain | Models หลัก | ทำอะไร |
|---|---|---|
| **Identity/Auth/RBAC** | User, Role, RoleAssignment, RolePermission, RefreshToken, Team, TeamMember | login, สิทธิ์, ทีม |
| **Characters/Talent** | Character, Creator, CharacterRelationship/Wardrobe/Expression/Pose, CharacterCategory(+Link), CharacterBlueprint, CharacterVoiceProfile | ตัวละคร AI + องค์ประกอบ |
| **Products/Brands/Clients** | Product, Brand, ProductCategory, Client | catalog สินค้า + แบรนด์ book + ลูกค้า |
| **Campaigns** | Campaign, CampaignCharacter, CampaignProduct | container การตลาด |
| **Production (narrative)** | Series(+Season/Character/Location/Product/Audience), Episode(+Character/Product), Shot(+Character), Location | Series→Episode→Shot |
| **Content Calendar/Live** | ContentItem(+Character/Product), LiveSession(+Character/Product) | โพสต์ + live commerce |
| **Affiliate Clip Factory** | AffiliateClipJob, ClipShot | คลิปรีวิว UGC (แยกจาก narrative) |
| **Interaction Library** *(moat)* | HandProfile, Gesture, ProductState(+Transition), InteractionTemplate(+Step), CameraPreset, LightingPreset, DirectorRun | ไวยากรณ์หยิบจับสินค้า |
| **Prompts/Assets** | Prompt, PromptVersion, PromptLink, PromptGenerationRun, Platform, Asset, AssetLink, EntityVersion | prompt versioned + media provenance |
| **AI Usage/Credits** | AiTool, AiCreditTopup, AiUsageLog, AiUsageLink | บัญชีต้นทุน AI |
| **Compliance/Rights/QC** | BannedWord, Right, QcReview | governance |
| **Analytics/KPI/Intel** | ContentPerformance, ImportJob, KpiGoal, AudienceSegment(+ links), CustomerFeedback, IdeationRun, ContentInsight, Competitor(+Channel/Content/Insight) | data loop |
| **Client Jobs** | Job, JobProduct/Presenter/Crew/Deliverable | งานรับจ้าง |
| **Workflow/Ops** | Task(+Comment), Postit(+Comment), Idea, ImageRequest, Notification, ExportJob, DownloadLog, AuditLog, SystemSetting, MediaLink | งาน/ไอเดีย/ระบบ |

### 3.2 Core Entities (สรุป — รายละเอียดฟิลด์อยู่ใน schema.prisma)

- **Character** — ตัวละคร AI: `displayCode` (unique, immutable), `nameTh/En`, JSON `persona/visualDna/commerceProfile/voiceProfile`, `dos[]/donts[]`, `blueprintId`, `status: ApprovalStatus`, `version`. เชื่อมทุก surface ผลิต (Campaign/Series/Episode/Shot/Content/Live/Job)
- **Product** — สินค้า: `price/salePrice`, `platformLinks`, affiliate fields (`isAffiliate, affiliateUrl, commissionPct`), import fields (`sourcePlatform, externalItemId, shopName, rating, soldTotal, sourceRaw`), `reviewBrief` JSON, `claimRiskLevel`, `restrictedClaims[]`
- **Brand** — knowledge (`brandStory, toneOfVoice, doList[], dontList[], restrictedClaims[]`) + brand book (`mission, vision, coreValues[], positioning, tagline, wordBankUse/Avoid[], platformGuides, brandColors, brandFonts`) + governance (`bookVersion, bookApproverName, bookShareToken` unique)
- **AffiliateClipJob** — งานคลิป: `subjectType` (product/place/food/software), `mode` (hand/presenter), resource rail (`handId, characterId, wardrobeId, locationId, voiceProfileId`), `conceptsJson, templateId, directorRunId, script, finalVideoUrl, planJson, status` → มี `ClipShot[]`
- **ClipShot** — ต่อ shot: `shotOrder, sceneType` (presenter/hands/product_only/screen), `stillPrompt, motionPrompt, stillAssetId, dialogue, status` (pending/generated/approved), Drive video link
- **HandProfile / Gesture / ProductState** — hand: skin tone/nails/accessories + `allowedGestures[]/restrictedGestures[]` + child-hand compliance ; gesture: `requiredProductState/resultingProductState` (ขับ state machine), durations, riskLevel, prompt templates ; ProductState + Transition: state machine (sealed → opened → cap_removed → in_use → partially_used → result → empty)
- **DirectorRun** — AI วางแผนถ่าย: input (product + platform + duration + objective + style) → `resultJson` (steps + เหตุผล + promptPackage) → save เป็น template ได้
- **Prompt / PromptVersion** — `promptType` (identity/character_sheet/expression/outfit/scene/shot/negative/anti_clone), `bestFlag` ; version: `body, negativeBody, targetPlatform, generationParams, seed, sourceUrl`
- **AiUsageLog** — `userId, aiToolId, quantity, costBaht, outputsCount, outputType` + **AiUsageLink ≥1** (บังคับผูกงานจริง)
- **Job** — งานรับจ้าง: `type: JobType`, `status: JobStatus` (10 สถานะ), deliverable spec, pricing (`quotePrice, depositAmount, paymentStatus`)

### 3.3 Enums (16 — state machines)

| Enum | ค่า |
|---|---|
| **ApprovalStatus** (character/prompt/asset) | draft, internal_review, revision_needed, approved, production_ready, rejected, archived |
| **AssetStatus** | uploaded, ai_generated, selected, rejected, approved_reference, production_used, archived |
| **CampaignStatus** | brief, planning, production, review, published, completed, archived |
| **EpisodeStatus** | idea, script_draft, script_review, script_approved, shot_breakdown, production, edited, published, archived |
| **ShotStatus** | planned, prompt_ready, generating, generated, selected, rejected, edited, approved |
| **ContentStatus** | idea, brief, in_production, internal_review, revision_needed, approved, scheduled, published, archived |
| **JobStatus** | inquiry, quoted, confirmed, in_production, internal_qc, delivered, revision, approved, closed, cancelled |
| **JobType** | image_pack, video_review, live, mixed |
| **JobDeliverableStatus** | pending, submitted, approved, rejected |
| **LiveStatus** | scheduled, live, done, cancelled |
| **IdeaStatus** | captured, reviewed, shortlisted, adapted, converted, used, archived |
| **PostitStatus** | open, in_progress, resolved, archived |
| **TaskStatus** / **TaskPriority** | todo/in_progress/done/blocked · low/normal/urgent |
| **LegalStatus** (rights) | draft, internal_only, commercial_approved, restricted, expired, archived |
| **UserStatus** | active, suspended |

> **หมายเหตุ:** บาง status เป็น free-string ตั้งใจ (admin ขยายได้) — `AffiliateClipJob.status` (draft/planning/generating/review/ready/published/archived), `ClipShot.status`, `DirectorRun.status`, `ImageRequest.status`, `HandProfile.status`, `PromptVersion.targetPlatform` (D4: platform-agnostic), `RolePermission.viewScope`

### 3.4 Many-to-many joins (composite PK)
Campaign↔Character/Product · Series↔Character/Location/Product · Season↔Product · Episode↔Character/Product · Shot↔Character · ContentItem↔Character/Product · Live↔Character/Product · Job↔Product(JobProduct)/Character(JobPresenter)/Creator(JobCrew) · Character/Series/Location↔Product tie-ins · Character/Series/Brand↔AudienceSegment · Character↔Category · User↔Role · Team↔User · ProductState↔ProductState (self, Transition)

### 3.5 Migration timeline (37 slices — build order)
`init` (RBAC/Character/Asset/Prompt/Task) → `phase2_3_entities` (Product/Brand/Campaign/Series/Episode/Shot/Content/Live/Perf/Competitor/Idea/Postit) → series_hub → system_settings → creators → task_trello → product_categories → jobs_mvp → character_prd_sections → kpi_goals → audience_segments → product_tie_ins → **affiliate_content** → **ai_usage_accountability** → **content_intelligence_loop** → media_center → brand_book → prompt_capture_source → view_scope → episode_owner → image_requests → brand_share_and_teams → character_category → product_import_fields → **interaction_library_slice1** (hands/gestures/product-state) → interaction_templates → camera_lighting_library → **ai_director** → character_blueprint → character_sheet_pose_dos_donts → character_nickname → **affiliate_clip_jobs** → **banned_words** → **ugc_studio_v2** → product_review_brief → customer_feedback_rating

**Arc:** CMS/RBAC → commerce & narrative → jobs & team ops → affiliate + AI cost + intelligence → brand book → **Interaction Library / AI Director (moat)** → **Affiliate Clip Factory (UGC Studio v2)** + compliance

---

## 4. โมดูลฟังก์ชัน (ตามผังเมนู)

IA ทั้งหมดนิยามที่เดียว: `apps/web/src/components/AppShell.tsx` (`NAV_SECTIONS`) — sidebar ซ้าย (w-56) + header (search กลาง + theme toggle + bell + profile menu) 9 sections

> รูปแบบแต่ละหน้า: **หน้าจอ** (route) — ทำอะไรได้ + **routes API** หลัก

### Overview
- **Dashboard** `/dashboard` *(adminOnly)* — KPI cards (characters ready/total, jobs in production, content สัปดาห์นี้, live วันนี้; **finance KPI: pipeline value, GMV, delta — gate `financeVisible`**), Action Needed (overdue/approvals/QC/deliverables/rights หมดอายุ), pipeline bars, performance widget (7-day GMV, top presenters/products), agenda, activity feed, personal KPI. อ่านอย่างเดียว. API: `GET /dashboard`
- **Media Center** `/media` — grid ลิงก์ทรัพยากรภายนอก (Drive) ตามหมวด; admin จัดการผ่าน Settings. API: `GET /media-links`, `/media-links/manage`, CRUD

### Talent
- **Characters** `/characters` (+`/[id]`) — roster ตัวละคร AI: filter หลายมิติ (category/product/series/brand/client/campaign/audience/tag/relationship), sort GMV/views/usage, grid/table. สร้างได้ 2 ทาง: **forward** (กรอกฟอร์ม) หรือ **reverse-capture** (วาง text/รูป external → `POST /ai/characters/capture` คืน draft + confidence + missing fields ตาม **Blueprint**). Detail: persona + Visual DNA + gallery (face/full body/expression/outfit) + wardrobe/expressions/poses/relationships/rights/tie-in + **approval state machine** + AI similarity/dedup + AI spec-verify (`/ai/character-spec-verify` เทียบภาพ gen กับ spec). API: `GET/POST/PATCH /characters`, `/characters/stats`, `PATCH /:id/status`, `/:id/versions`, sub `/relationships /wardrobe /expressions /poses`, `/character-blueprints`, `/character-categories`, `/creators`, `/tags`
- **Prompt Library** `/prompts` (+`/[id]`) — catalog แบบ image-first, 2 tab (⭐ คลังหลัก / 🌐 Prompt Hub), filter platform, relation chips. **Versioning เต็ม:** ดู/ก๊อป version (`PromptViewerModal` — body + model/params + negative prompt), แก้เป็น version ใหม่ (ประวัติไม่หาย), "ใช้ตัวนี้" (ก๊อป version เก่าขึ้นเป็นล่าสุด). API: `GET/POST/PATCH /prompts`, `PATCH /:id/status`, `POST /:id/versions`, `/:id/links`, `/:id/relations`, `POST /prompt-versions/:id/runs`, `/platforms`, `/prompts/capture`, `/prompts/hub`
- **Location / Voice / Rights** `/library` — tabbed: Locations (มี cover), Voices, Rights/Legal (owner, commercial usage, territory, exclusivity, `LegalStatus`, risk). API: `/locations`, `/voices`, `/rights` (+`PATCH /:id/status`), `/qc-reviews`

### Interaction Library *(perm `library`)* — หัวใจความ consistent
- **Hand Library** `/hands` — CRUD hand profiles (category/child/suit) + reference image
- **Gesture Library** `/gestures` — CRUD gestures (category/risk/packaging) + product-state awareness
- **Interaction Templates** `/interaction-templates` (+`/[id]`) — recipe (ITPL-code); create/**clone**/archive; `GET /:id/validate`, `/:id/prompt-package`, `PUT /:id/steps`
- **Camera Presets** `/camera-presets` · **Lighting Presets** `/lighting-presets` — CRUD + prompt viewer + External Capture (วาง external → AI draft → review → save). seed ~18 camera / ~16 lighting
- **AI Director** `/director` — วางแผน shot อัตโนมัติ: เลือก product + packaging + platform + duration + objective + style + hand → `POST /director/recommend` → director run (มี history, apply ได้). API: `/director/recommend`, `/:id/apply`

### Affiliate Video Production *(perm `product`)*
- **Products** `/products` (+`/[id]`) — catalog: filter brand/category, sortable table, cover, bulk (set category/brand, archive; **admin hard-delete** perm `X`), archived view, import, category manager, review-brief modal, ปุ่ม "🎞️ ทำคลิป" → deep-link `/clip-jobs?createFor=<id>`. API: `GET/POST/PATCH /products`, `POST /affiliate-import`, `/bulk/*`, `POST /:id/review-brief/extract`, `/import/preview`, `/import`, `DELETE /:id` (X)
- **Clip Jobs** `/clip-jobs` (+`/[id]`) — **"UGC Studio v2.1"** workspace: เลือก subject (🛍️ product / ☕ place / 🍜 food / 💻 software) → 3 สเตจ: ① **Concept** (AI เสนอ 3 คอนเซปต์, "🔄 ขอแนวใหม่") ② **Storyboard + Prompt** (resource rail, voice-over, headline, shot board ต่อ sceneType; software = capture order ไม่ gen; duration step 8-วิ Veo/Kling) ③ **📦 ชุดพร้อมโพสต์** (upload stills, Drive video link, on-screen text, script+caption+CTA). มี **Banned Words scanner** client-side (🔴 ban / 🟡 risky) + copy image เป็น PNG ไปวาง Flow/ChatGPT. API: `GET/POST/PATCH /clip-jobs`, `POST /:id/concepts`, `POST /:id/plan`, `PUT /:id/shots`, `PATCH /:id/shots/:sid`, `POST /:id/shots/:sid/recompose`, `GET /:id/package`
- **Affiliate Content** `/affiliate` — grid สินค้า affiliate ตามหมวด; **วางลิงก์ affiliate ≤50** (Shopee/TikTok Shop/Lazada) import; per-product + **batch AI generation** (hook/body/CTA/hashtags + shot script) แต่ละอันสแกน banned words. API: `POST /ai/affiliate/review`, `/ai/affiliate/batch`, `GET /ai/affiliate/content`

### Production
- **Jobs** `/jobs` (+`/[id]`) — งานรับจ้าง: **Kanban** (drag 6 คอลัมน์) หรือ list; state machine 10 สถานะ (inquiry→…→closed/cancelled, บังคับผ่าน `JOB_NEXT`); due chips, priority. Detail: brief, quote/deposit/payment, products, presenters, crew (freelancer + role note), **deliverable rounds** + client feedback. API: `/jobs` CRUD, `PATCH /:id/status`, archive, `/:id/deliverables`, `/clients`
- **Clients** `/clients` (+`/[id]`) — CRM (type brand/agency/shop/individual, contact, optional brand link)
- **Brands** `/brands` (+`/[id]` +`/[id]/book`) — brand records + **Brand Book editor** (foundation/verbal/visual/governance/audiences/restricted claims) + completeness score + **public share** read-only `/share/brand-book/[token]` (ไม่ต้อง login, print/PDF). API: `/brands` CRUD, `GET /:id/book`, `/:id/audiences`, `POST/DELETE /:id/share`, **public** `GET /public/brand-book/:token` (+ `/asset/:assetId`)
- **Campaigns** `/campaigns` (+`/[id]`) — container: objective + KPI, ผูก characters/products (claim-risk badge)/episodes/content. API: `/campaigns` CRUD, `PATCH /:id/status`, `/:id/characters`, `/:id/products`
- **Series Hub** `/series` (+`/[id]`) — series/universe (premise, bible, tie-in products, audiences). API: `/series` CRUD, seasons, `/:id/characters`, `/:id/locations`, `/:id/episodes`, `GET /:id/analytics`, `POST /:id/calendar-suggest`
- **Episodes & Shots** `/episodes` (+`/[id]` +`/[id]/storyboard`) — ตอน: season/EP number/logline, assign owner, link cast/products, script + **shot list** (reorder, per-shot status) + **Storyboard** view (AI draft ทุก shot). API: `/episodes` CRUD, `PATCH /:id/status`, `/:id/shots`, `/shots/reorder`, `POST /:id/handoff`, `POST /:id/storyboard-prompts`, `GET /:id/storyboard`, `POST /shots/:id/image-prompt`
- **งานภาพ / Image Requests** `/image-requests` (+`/[id]`) — คิวขอผลิตภาพ (IMG-code): platform, size (9:16), promo text, mood/ref, track status. API: `/image-requests` CRUD, `POST /:id/status`, `POST /:id/draft-prompt` (AI)
- **My Work** `/my-work` — task inbox ส่วนตัว (landing ของ non-admin): สร้าง task, งานที่ได้รับ + priority + checklist + comment + attachment. API: `/tasks`, `/tasks/assignees`, `/:id/comments`
- **มอบหมายงาน / Assignments** `/assignments` *(perm `setting`)* — มุมมองหัวหน้า: KPI ต่อคน (on_track/behind/done) + workload (task/image/episode/content เปิดค้าง). API: `/kpi/assignment-summary`

### Publishing
- **Content Calendar** `/calendar` — ปฏิทินเดือน, คลิกวันสร้าง content (title/account/caption/hashtags/CTA/links/schedule). API: `/content-items`, `/content-items/calendar`, `PATCH /:id/status`, `/block`
- **Live Schedule** `/live` *(perm `live`)* — schedule live: GMV target, offers, script/rundown, FAQ, scene setup. API: `/live-sessions` CRUD, `PATCH /:id/status`, `PUT /:id/products`
- **Performance** `/performance` *(perm `performance`)* — analytics: top character (GMV)/platform/content, ป้อนมือ + **import CSV**, แก้ inline. API: `/performance` summary/overview/CRUD, `GET /import/template`, `POST /import`

### Intelligence
- **Customer Voice** `/customer-voice` *(perm `content`)* — เก็บ feedback (comment/chat/sales_note) + AI sentiment/theme + reprocess. API: `/customer-feedback` (+ `POST /extract-reviews` AI, `/:id/reprocess`)
- **AI Ideation** `/ideation` *(perm `content`)* — gen ไอเดีย mode **Auto/Guided/Iterate**, optional Claude **web trends** (คิดเงินเพิ่ม default off), scope brand/audience/platform → convert เป็น Idea/Content. API: `GET /ai/ideate/status`, `POST /ai/ideate`, `/ideation-runs`, `POST /:id/convert`
- **Content Analytics** `/content-analytics` *(perm `content`)* — aggregate + AI synthesis, scope overall/platform/character/format, episode-level cost sharing. API: `/content-insights` (+ `POST /generate`, `GET /roi` finance-gated)
- **Idea Library** `/ideas` *(perm `idea`)* — quick-capture (วาง text/URL, Enter save), AI-assist, convert เป็น campaign/episode. API: `/ideas` CRUD, `PATCH /:id/status`, `POST /:id/ai-assist`, `/:id/convert`
- **Post-it Board** `/board` *(perm `postit`)* — sticky notes, convert → My Work task. API: `/postits` CRUD, `/:id/comments`, `POST /:id/convert-to-task`
- **Competitors** `/competitors` *(perm `competitor`)* — profile + social channels; insight แยก Fact/Assumption/Recommendation. API: `/competitors` + `/channels /contents /insights`, `POST /insights/:id/convert-to-campaign`
- **AI Usage / ต้นทุน AI** `/ai-usage` *(perm `ai_usage`)* — ดู §6

### Admin
- **Users & Roles** `/users` *(perm `user`)* — user CRUD + **Teams** (create/rename/archive/delete, set members → ขับ `viewScope: team`). API: `/users`, `/roles`, `/roles/permissions`, `PATCH /roles/:key/permissions/:module`, `/teams`
- **Settings** `/settings` *(perm `setting`)* — sub-sections (deep-link `?section=`): ⚙️ System/Credentials (รวม `ANTHROPIC_API_KEY`, R2), 🎯 Team KPI Goals, 👥 Audience Segments, 🎭 Character Categories, 🧬 Character Blueprints, 🚫 Banned Words, 🔁 Product States, 💸 AI Tools & cost, 📁 Media Center. API: `GET/PUT /settings`

### Global / non-nav
- **Login** `/login` — email/password, show/hide, ปุ่ม Google/MS/Apple (coming soon), เก็บ token + role-based redirect
- **Profile** `/profile` — แก้ชื่อ/email/avatar, เปลี่ยนรหัส, logout
- **Search** `/search` — cross-system search (header → `/search?q=`). API: `GET /search` (กรองตาม V-permission + scope)
- **Share Brand Book** `/share/brand-book/[token]` — public, print-friendly (deliverable ให้ลูกค้า)

---

## 5. AI Integration (Claude)

**Provider เดียว: Anthropic Claude** (`@anthropic-ai/sdk`) รวมศูนย์ที่ **`apps/api/src/ai/ai-claude.service.ts`** (`AiClaudeService`) — ทุกฟีเจอร์ inject ตัวนี้ ไม่สร้าง client เอง

**Config (ต่อ call, ไม่ cache):**
- key = `SettingsService.get('ANTHROPIC_API_KEY')` ?? env
- model = setting/env `ANTHROPIC_MODEL` ?? default **`claude-opus-4-8`**
- → เปลี่ยน key/model ที่หน้า Settings ได้โดยไม่ restart

**2 โหมด call:**
- `callClaude<T>()` — structured JSON (`output_config.format = json_schema`) → `{parsed, model, usage, latencyMs}`
- `callClaudeText()` — plain text + server tools รวม **web search** (`web_search_20260209`, ใช้ใน ideation)

**Error mapping:** `AuthenticationError`→503 "not configured" · `RateLimitError`→429 · `APIError` อื่น→502 · `stop_reason==='refusal'`→400 · JSON พัง→502. Log `input/output tokens + latency` ทุก call, เขียน `auditLog`

**ฟีเจอร์ AI (routes ใต้ `/ai*`):**
| กลุ่ม | routes |
|---|---|
| Character | `POST /ai/characters/draft`, `/ai/characters/capture`, `/ai/character-spec-verify`, `/ai/characters/:id/similarity` |
| Affiliate/UGC | `/ai/affiliate/review`, `/ai/affiliate/batch`, clip `POST /clip-jobs/:id/concepts`, `/plan`, shot recompose |
| Production | `POST /ai/episodes/:id/shot-list`, `/ai/content/caption`, storyboard prompts, `/ai/series/:id/bible-draft`, `/continuity-check`, `/next-episode`, `/ai/weekly-plan` |
| Intelligence | `POST /ai/ideate` (+web trends + performance context), idea ai-assist, content insights, `/customer-feedback/extract-reviews` |
| Compliance | `POST /banned-words/ai-review` (JSON findings) |
| Image/Library | `POST /image-requests/:id/draft-prompt`, `/library-capture/extract`, `/prompts/capture` |
| QC | `POST /ai/qc/assets/:assetId/consistency` |

**Reverse-capture theme:** characters, prompts, library entities, products — ดูด/สกัดจาก external ref/URL เข้า catalog ได้หมด

---

## 6. AI Cost Accountability (`apps/api/src/ai-usage`)

**ปัญหาที่แก้:** ค่า subscription AI แพง token หมดไวงานออกน้อย → สงสัยพนักงานใช้ account ส่วนตัว

**4 หลักการ (เคาะแล้ว):**
1. **ผูกงานบังคับ** — ทุก `AiUsageLog` ต้องมี `AiUsageLink ≥1` ไปงานจริง (episode/shot/content/image_request) — ผูกไม่ได้ = บันทึกไม่ได้ = งานส่วนตัวเข้าบัญชีไม่ได้
2. **หน่วย = token/credit + บาท** — เก็บทั้ง quantity และ costBaht เทียบข้ามเครื่องมือด้วยบาท
3. **Visibility** — พนักงานเห็นของตัวเอง, `FINANCE_ROLES` (admin/founder) เห็นทุกคน (ตารางประสิทธิภาพต่อคน)
4. **Pricing = ledger จริง (blended rate)** — `AiTool` blended rate = Σ `AiCreditTopup.amountBaht` ÷ Σ quantity (source `ledger`) → fallback `defaultRateBaht` → null. บันทึก topup ใหม่ → **recompute ย้อนหลัง** log ที่ cost=0 (`recomputeZeroCostLogs`). auto `costBaht = quantity × blendedRate`

**Summary/flags** (`GET /ai-usage/summary`): totals, per-tool, per-person (`linkedPct`, cost-per-output), **outlier flag** = `review` ถ้า cost/output > 1.75× team median หรือ spend แต่ outputs=0

**Routes:** `POST/GET/PATCH/DELETE /ai-usage`, `GET /ai-usage/summary`, `/link-search`, `GET/POST /ai-tools`, `/ai-tools/:id/topups`

---

## 7. Compliance & Governance

- **Banned Words** (`compliance` module, `/banned-words`) — คำต้องห้ามต่อ platform (severity ban/risky, replacement, category); seed ~50 คำ health/beauty/weight-loss/finance/gambling (Thai อย.). `POST /scan` (deterministic), `POST /ai-review` (Claude JSON findings), `promptBlockFor(platform)` ฉีด block เข้า prompt ปลายน้ำ (clip planner ใช้ `buildBannedBlock`). Frontend มี matcher client-side mirror
- **Restricted claims** — ต่อ Product/Brand + `claimRiskLevel` → เช็คตอน caption/script QC (อาหารเสริม/เครื่องสำอาง = high risk)
- **Rights/Legal** (`/rights`) — commercial usage, territory, exclusivity, `LegalStatus`, expiry
- **QC Review** (`/qc-reviews`) — polymorphic 1–5 score ต่อ entity + summary
- **Human-approval guardrail** — AI ตั้ง `approved`/`published` ไม่ได้ (server เช็ค `via==='ui'`); draft_write แตะเฉพาะ status draft/idea/planned
- **Audit** — เขียน `auditLog` ทุก action (login, status change, AI call, import) พร้อม `via` (ui/api/mcp)

---

## 8. Content Intelligence Loop

closed loop 4 ระบบ (spec `_docs/content_intelligence_spec.md`, ตอนนี้มีโมดูล `content-intelligence` + `intelligence` จริง):

```
Customer Voice (CustomerFeedback: comment/chat/sales_note + AI sentiment/theme + marketplace rating)
   → AI Ideation (Auto/Guided/Iterate + web trends + top-performer context)
   → Idea Library / Content / Episode
   → Content Calendar / Live → เผยแพร่
   → Performance (GMV/CVR/ROAS ...) → Content Analytics (AI synthesis)
   → กลับเข้า Ideation
```
เสริมด้วย **Competitor Intelligence** + **Brand Knowledge Base** (ฉีดเข้า prompt generation) + **AudienceSegment** taxonomy

---

## 9. Assets & Storage (`apps/api/src/assets`)

- **StorageDriver facade** — **Cloudflare R2** (S3-compatible, `@aws-sdk/client-s3`) เมื่อ config ครบ, ไม่งั้น **local disk** (`STORAGE_DIR` default `./storage`, กัน path-traversal). `POST /assets/migrate-to-r2` ย้าย bulk
- **Asset polymorphic** — `AssetLink` (entityType/entityId/linkRole เช่น `primary_reference, cover, thumbnail, review_image`)
- Upload multipart (memory storage, จำกัด size), download `StreamableFile`, bulk zip `GET /assets/zip/:entityType/:entityId`
- Thumbnail ต้องใช้ token (แนบ header → object URL); public share page ใช้ `<img src>` public URL ไม่ต้อง auth
- **วิดีโอ = Google Drive link** (ไฟล์ใหญ่เกินอัป)

---

## 10. Chrome Extension (AISTAR → Flow)

`extension/aistar-flow/` — MV3 **Side Panel**, ปัจจุบัน **v1.6.0**. เป็น REST client ของ API เดียวกัน (login เป็น user จริง → inherit RBAC). Hosts: prod `api-production-61ef.up.railway.app` / dev `localhost:4000`

**2 งานหลัก:**

**A) สะพานผลิตคลิป → Google Flow** (จุดประสงค์หลัก)
1. Login (email+pw → JWT, refresh auto, เก็บ `chrome.storage.local`)
2. เลือก Clip Job → เห็น shots เรียง (shot ปัจจุบัน highlight เหลือง)
3. **▶ วางลง Flow** — แนบ still + product ref images + ใส่ motion prompt เข้า Flow อัตโนมัติ (`content.js` inject); แนบลอง 3 ชั้น: `input[type=file]` → paste → drag-drop → fail = copy clipboard ให้ Ctrl+V เอง; ปุ่ม fallback 📋 prompt / 📋 รูป
4. **ผู้ใช้กด Generate เอง** (ตั้งใจ ไม่ใช่ข้อจำกัด)
5. **✅ gen แล้ว / ผ่าน** → `PATCH /clip-jobs/:id/shots/:sid` (pending→generated→approved) → shot ถัดไป
6. จบงาน วาง Drive link ที่ header → `PATCH /clip-jobs/:id` (`finalVideoUrl`)

**B) ดูดสินค้า Shopee → AISTAR** (v1.1+, `content-shopee.js`)
- บนหน้า `shopee.co.th` โผล่การ์ด "📥 ดูดหน้าสินค้า Shopee"
- **กลยุทธ์ scrape (v1.4):** อ่าน internal API ของ Shopee จาก session ที่ login อยู่ — `get_ratings` (รีวิว+ดาว), `get_shop_base` (ชื่อร้านจริง) ; **เลี่ยง `/api/v4/item/get`** เพราะ trigger captcha ; ชื่อ/รูป/ราคา/desc อ่านจาก DOM ; รีวิวใช้ "วิธี CEO" = คลิก filter "5 ดาว" + `UI_BLACKLIST` กันจับ UI string
- Human-in-the-loop: แก้ชื่อ/ราคา/desc, เลือกรูป (≤6), tick รีวิว, auto-match category จาก breadcrumb, เลือก/สร้าง Product
- **🚀 เริ่มดูด:** รูป → gallery (`POST /assets` หรือ `/assets/import-url`, linkRole `review_image`, archive ชุดเก่าก่อน = overwrite ไม่ซ้ำ) ; AI สกัด review brief (`POST /products/:id/review-brief/extract`, เติมเฉพาะฟิลด์ว่าง ไม่ทับที่คนแก้) ; รีวิว → `customer-feedback` (source `comment`, sourceRef `shopee_panel`, ลบของเก่าก่อน)
- **จุดประสงค์:** feed ให้ Clip Job pipeline — ตอนสร้าง clip job ดึงจากสินค้าอัตโนมัติ

**Views** (`panel.js`): `viewLogin` → `viewJobs` (list + filter + Shopee card) → `viewShots` ; + capture flow (scrape → curate → AI brief → save → "done" 3 ปุ่ม: เปิดในระบบ / ดูดต่อ / หน้าแรก — เพิ่ม v1.6 แก้ปัญหา "gen เสร็จแล้วค้าง")

> ⚠️ **สังเกต:** "Clip Job" + shots (`stillPrompt/motionPrompt/stillAssetId/sceneType`) **ไม่มีใน PRD v0.1/v0.2** — เป็น direction ใหม่ที่ยึดโค้ด/extension เป็นความจริง

---

## 11. Cross-cutting

- **Notifications** (`notifications.service`) — in-app: `notify(userIds, payload)`, `list(unreadOnly)`, `markRead`, `readAll`; fan-out `notifyRoles` (เช่น content review → creative_lead/qc_reviewer/admin). API: `GET /notifications`, `PATCH /:id/read`, `POST /read-all`
- **Audit log** — ดู §7
- **Search** (`search.service`) — multi-entity, intersect กับ module ที่มี `V` แล้วกรอง row-scope (content/episode) — เคารพ visibility เดียวกับ list
- **Exports/Sharing** — character export + **Obsidian vault export** (async job → `storageDir` → download by `jobId`); public sharing เฉพาะ brand-book token. API: `POST /characters/:id/export`, `/exports/:jobId`, `/exports/obsidian`
- **Versioning** — snapshot JSONB (`EntityVersion`), rollback = version ใหม่ (characters/episodes/prompts)

---

## 12. End-to-End Workflows

1. **Affiliate clip pipeline (สายหลัก CEO):** Products (หรือ Affiliate: วางลิงก์ → import / extension ดูด Shopee) → "🎞️ ทำคลิป" (`/clip-jobs?createFor=<id>`) → ① Concept (AI 3, regen) → ② Storyboard (shots + voice + headline + banned scan + ดึง review images) → ③ ชุดพร้อมโพสต์ (stills + Drive link + script/caption/CTA) → **extension วางลง Google Flow ทีละ shot → คนกด generate → approve** → log ลง Calendar + AI Usage
2. **Character lifecycle:** สร้าง forward/reverse-capture (ใช้ Blueprint) → Visual DNA + gallery/wardrobe/expressions → AI similarity + spec-verify → state machine draft → internal_review → approved → **production_ready** → ใช้เป็น presenter ได้
3. **Prompt version/use:** browse (คลังหลัก vs Hub) → เปิด version (copy body/params) → แก้เป็น version ใหม่ / "ใช้ตัวนี้" (re-promote) → link ไป character/product
4. **Client job:** Client → Job → Kanban (inquiry→…→delivered) → attach products/presenters/crew → deliverable rounds + client feedback (approve/reject) → close ; Brand Book แชร์ผ่าน public token
5. **Idea → content:** Customer Voice → AI Ideation (auto/guided/iterate + web trends) → Idea/Content → convert Campaign/Episode → shots → Storyboard → Calendar → Performance → Content Analytics → กลับ ideation
6. **AI cost loop:** ลง AiTool → log usage ผูกงาน → record topup (recompute blended rate + back-fill) → summary เห็น outlier ต่อคน
7. **Compliance scan:** `POST /banned-words/scan` + `/ai-review` → block ฉีดเข้า generation prompt
8. **Login → landing:** admin → `/dashboard` (finance gate) ; อื่น ๆ → `/my-work` ; menu กรอง live จาก `/auth/me`

---

## 13. สถานะ Implement / Gaps / Open Questions

**✅ มีจริงในโค้ด (เกินกว่า PRD):** affiliate-clips/Clip Jobs, ai-usage accountability, content-intelligence, interaction library + AI Director, brand book + public share, image-requests, banned-words, tie-ins, audience, media center

**❓ ต้อง verify (docs อ้าง vs ของจริง):**
1. Phase-1 AC ที่ยัง `[ ]` ใน dev plan: AC-3 (upload 200MB + thumbnail), AC-6 (prompt search <2s), AC-7 (export ZIP + download log)
2. AI = draft-only บังคับ server-side ทุก path (ทดสอบ MCP จริง — AC-5 "รอ MCP client")
3. Finance gate ที่ระดับ API (ไม่ใช่แค่ซ่อน UI)
4. Permission matrix seed ตรงกับ addendum §C ครบ 15 roles
5. Infra จริง: search = SQL ILIKE (ไม่ใช่ Meilisearch), storage local/R2, jobs in-process (ไม่ใช่ BullMQ)

**🔓 Open questions:** LLM cost ceiling/เดือน, RPO/RTO ตอน Live (เสนอ RPO ≤24h/RTO ≤8h), MFA (backlog), ลำดับ build content-intelligence, storyboard images (AI draft prompt vs gen ในระบบ), Brand Book PDF export (Phase 2)

**⚠️ ความเสี่ยง:** IP leak (Prompt+Visual DNA+Bible), prompt เสื่อมถ้าไม่ผูก platform/model version, adoption

---

## 14. Local Dev Setup

```bash
# 1. Postgres (docker) — creds: aistar/aistar/aistar
docker start aistar-pg            # หรือ docker run --name aistar-pg -e POSTGRES_USER=aistar \
                                  #   -e POSTGRES_PASSWORD=aistar -e POSTGRES_DB=aistar -p 5432:5432 -d postgres

# 2. deps + prisma client
pnpm install
pnpm --filter api exec prisma generate

# 3. apps/api/.env  (ไม่ commit)
#   DATABASE_URL=postgresql://aistar:aistar@localhost:5432/aistar
#   JWT_SECRET=local-dev-secret
#   CORS_ORIGIN=http://localhost:3002
#   STORAGE_DIR=./storage
#   ANTHROPIC_API_KEY=          # ว่างได้ ฟีเจอร์ AI จะ 503

# 4. migrate + seed (ครั้งแรก / schema เปลี่ยน)
pnpm migrate && pnpm seed

# 5. run
PORT=4000 pnpm dev:api          # API  → http://localhost:4000/api
pnpm dev:web                    # Web  → http://localhost:3002 (3000 ชนแอปอื่น)
```
- **Admin login:** `admin@aistar.local` / `aistar-admin-2026`
- **Extension:** chrome://extensions → Load unpacked → `extension/aistar-flow/` (dev host = localhost:4000)

---

*Reverse-engineered 2026-07-21 · ยึดโค้ดจริงเป็นความจริง · แก้ที่นี่เมื่อระบบเปลี่ยน*
