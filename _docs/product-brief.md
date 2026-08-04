---
title: AISTAR Talent OS — Product Brief
version: 1.0
status: living-document (Single Source of Truth)
lastUpdated: 2026-07-21
method: reverse-engineered จากระบบที่สร้างจริง (API + Web + Extension + schema) + PRD v0.1/v0.2
owner: Nat
relatedDocs:
  - product-spec.md (รายละเอียดเชิงเทคนิค/ฟังก์ชันทั้งหมด)
  - aistar_talent_os_srs_prd_v0_1.md (PRD ต้นฉบับ — historical)
  - aistar_talent_os_srs_prd_v0_2_addendum.md (decision log D1–D10 — historical)
---

# AISTAR Talent OS — Product Brief

> **เอกสารนี้คืออะไร:** สรุปเชิงกลยุทธ์ของผลิตภัณฑ์ — *ทำไม / ทำให้ใคร / ไปทางไหน* เขียนจากการ reverse-engineer ระบบที่สร้างไปแล้วจริง (ไม่ใช่แค่ที่ตั้งใจไว้ในอดีต) ใช้คู่กับ [`product-spec.md`](./product-spec.md) ที่ลงรายละเอียด *ทำงานยังไง*
>
> ทั้งสองไฟล์ถือเป็น **Single Source of Truth (SSOT)** ของโปรเจกต์ — เมื่อ direction เปลี่ยน ให้แก้ที่นี่ก่อน แล้วค่อยไปทำในโค้ด

---

## 1. บทสรุปผู้บริหาร (Executive Summary)

**AISTAR Talent OS** คือ **ระบบปฏิบัติการภายในองค์กร (internal, single-tenant OS)** สำหรับสตูดิโอผลิตคอนเทนต์ด้วย **AI Talent / AI Character** ของ AISTAR — ใช้บริหารตั้งแต่การ *สร้างตัวละคร AI* → *วางแผนผลิตคลิป* → *เผยแพร่* → *วัดผล* → *เรียนรู้กลับมาผลิตรอบใหม่* ครบวงจร

เป้าหมายหลักคือเปลี่ยน AISTAR จาก **"ทีมทำคลิป AI แบบ ad-hoc"** ให้กลายเป็น **"AI Talent Commerce Production OS"** ที่ผลิตได้เร็ว คุมคุณภาพ/ความ consistent ได้ ต่อเนื่อง วัดผลได้ และควบคุมต้นทุน AI ได้

ระบบมีจริง 3 ส่วน:
- **Web app** (Next.js) — สำนักงานกลางของทีม ~40 หน้าจอ
- **API** (NestJS) — 33 โมดูล, ~60+ ตารางฐานข้อมูล, เครื่องยนต์ AI = **Anthropic Claude** (`claude-opus-4-8`)
- **Chrome Extension "AISTAR → Flow"** (v1.6.0) — สะพานเชื่อมงานผลิตจริงกับ Google Flow + ดูดสินค้า Shopee เข้าระบบ

---

## 2. ปัญหา & โอกาส (Problem)

AISTAR ผลิตคลิป AI อยู่แล้ว แต่เจอปัญหาที่ทำให้ scale ไม่ขึ้น:

| ปัญหา | ผลกระทบ |
|---|---|
| **ตัวละคร AI หน้าหลุด / style หลุด** ข้ามคลิป | แบรนด์/คาแรกเตอร์ไม่ consistent → ดูไม่โปร, ต่อยอดเป็น IP ไม่ได้ |
| **ไอเดีย/โน้ตกระจัดกระจายในแชตส่วนตัว** | ความรู้ตกหล่น หาไม่เจอ ทำงานซ้ำ |
| **ไม่มี data loop** จาก performance กลับมาสู่การตัดสินใจผลิต | ผลิตแบบเดา ไม่รู้ว่าอะไรเวิร์ก |
| **ค่า subscription AI แพง (Google Flow / Grok ฯลฯ) token หมดไวแต่งานออกน้อย** | สงสัยพนักงานเอา account ไปใช้งานส่วนตัว — ควบคุมต้นทุนไม่ได้ |
| **มือหยิบจับสินค้าในคลิปดูไม่จริง / ไม่ต่อเนื่อง** | คลิปรีวิวสินค้าไม่น่าเชื่อถือ |
| **ความเสี่ยงด้านคำโฆษณา (อย./แพลตฟอร์มแบน)** | คลิปโดนแบน, แบรนด์เสียหาย |

**โอกาส:** ทำระบบกลางที่คุม *ความ consistent* ของตัวละคร + *กระบวนการผลิต* + *ต้นทุน AI* + *compliance* + *data loop* ไว้ในที่เดียว → ผลิต affiliate/UGC content ได้เป็นโรงงาน

---

## 3. Vision & Positioning

> **Vision:** สร้างระบบกลางสำหรับบริหาร AI Talent, AI Short Drama, AI Content Production และ Live Commerce ที่ทำให้ทีมผลิตคอนเทนต์คุณภาพสูงได้อย่างเป็นระบบ และนำข้อมูลกลับมาเรียนรู้เพื่อเพิ่ม Reach, Engagement, Conversion และ GMV

**Positioning:** AISTAR Talent OS = **Creative Intelligence + AI Talent Asset Hub + Production Workflow + Commerce Performance System**

ไม่ใช่แค่ Content Calendar หรือ Character Database — แต่เป็น **"ระบบปฏิบัติการสำหรับค่ายดารา AI"** ที่บริหาร IP ระดับมืออาชีพ ตั้งแต่ Character IP → Content Performance → Commerce Intelligence

---

## 4. กลุ่มผู้ใช้ (Users & Personas)

ผู้ใช้คือ **ทีมงานภายใน AISTAR หลายคน หลายบทบาท** (ไม่ใช่ single user) ระบบมี **15 roles** พร้อม permission แบบละเอียด (ดู [`product-spec.md`](./product-spec.md) §2):

| Persona กลุ่ม | Roles | สนใจหน้าจอ/งานหลัก |
|---|---|---|
| **ผู้บริหาร / CEO** | `admin`, `founder` | Dashboard (เห็นคนเดียว), ตัวเลขการเงิน (GMV/revenue — gate เฉพาะกลุ่มนี้), AI Usage cost summary, Users/Roles, Settings |
| **หัวหน้าครีเอทีฟ / อนุมัติ** | `creative_lead`, `qc_reviewer` | อนุมัติ character/story/campaign, QC ความ consistent, claim risk |
| **ทีมสร้างตัวละคร** | `character_designer`, `creator`, `prompt_engineer` | Characters, Prompt Library, Interaction Library |
| **ทีมผลิต** | `ai_video_operator`, `video_editor`, `script_writer` | Clip Jobs (UGC Studio), Episodes/Shots, My Work |
| **ทีมวางแผน/เผยแพร่** | `content_planner`, `publisher`, `commerce_lead` | Content Calendar, Live Schedule, Products, Campaigns |
| **ทีมวิจัย/กลยุทธ์** | `researcher` | Customer Voice, AI Ideation, Competitors, Idea Library |
| **Dev/automation** | `dev_api` | ใช้งานผ่าน API/MCP (read + draft เท่านั้น) |
| **ลูกค้า (external)** | ไม่ต้อง login | เห็นเฉพาะ Brand Book ที่แชร์ผ่าน public token |

**JTBD สำคัญที่ระบบตอบ:**
- Character Designer เจอฟอร์ม ~50 ฟิลด์ → **AI Character Wizard** ช่วยกรอก 3 ฟิลด์แล้ว AI ร่างที่เหลือ
- AI Video Operator "ไม่รู้วันนี้ทำ shot ไหน" → **My Work** รวมงานที่ได้รับมอบหมาย
- CEO อยากเห็นตัวเลขเงิน/ต้นทุนแบบ gate จากทีม → **finance-gated views**

---

## 5. Business Model — ทำไมสร้าง

**ไม่มี revenue model จากตัวระบบ** (decision D2 ตัด SaaS ทิ้ง — single-tenant ใช้ภายในเท่านั้น) ระบบสร้างมูลค่าทางอ้อม 3 ทาง:

1. **โรงงานผลิต affiliate/UGC content** — ผลิตคลิปรีวิวสินค้าจำนวนมากเพื่อสร้าง GMV/commission ให้ AISTAR เอง
2. **งานรับจ้างผลิต (Client Jobs)** — รับผลิตให้แบรนด์ลูกค้า (มี quote/มัดจำ/deliverable rounds/Brand Book ส่งมอบ)
3. **ควบคุมต้นทุน AI** — ระบบบัญชีต้นทุน AI (blended-rate ledger + ผูกงานบังคับ) ที่ทำให้เห็นว่าใครใช้ token คุ้ม/ไม่คุ้ม

---

## 6. ขอบเขตผลิตภัณฑ์ (Feature Pillars)

ระบบจริงประกอบด้วย 7 เสาหลัก (รายละเอียดแต่ละหน้าจอ/route ดู [`product-spec.md`](./product-spec.md) §4):

1. **Talent / Character IP Hub** — สร้าง/บริหารตัวละคร AI (Visual DNA, wardrobe, expressions, poses, relationships), Prompt Library แบบ versioned, Location/Voice/Rights
2. **Interaction Library** *(หัวใจ/moat)* — คลัง "ไวยากรณ์การหยิบจับสินค้า": Hands, Gestures, Product-State machine, Camera/Lighting presets, Interaction Templates, **AI Director** (วางแผนถ่ายอัตโนมัติ)
3. **Affiliate Video Production** — Products (ดูดจาก Shopee/marketplace) → **Clip Jobs (UGC Studio v2)** 3 สเตจ (Concept → Storyboard → ชุดพร้อมโพสต์) → Affiliate Content
4. **Production Pipeline** — Client Jobs (Kanban), Clients, Brands + Brand Book, Campaigns, Series → Episodes → Shots → Storyboard, Image Requests, My Work, Assignments
5. **Publishing** — Content Calendar, Live Commerce Schedule, Performance
6. **Intelligence Loop** — Customer Voice → AI Ideation → Content Analytics → กลับสู่ ideation; Competitors, Idea Library, Post-it Board
7. **Governance** — RBAC 15 roles, AI Usage accountability, Compliance (Banned Words/Rights/QC), Audit log, Export/Share

---

## 7. หลักการออกแบบสำคัญ (Design Principles)

ทุก pillar ยึด 4 หลักนี้ (สะท้อนใน architecture จริง):

- **Human-in-the-loop เสมอ** — AI *ร่าง* (draft), มนุษย์ *กด generate เอง* และ *อนุมัติเอง* บังคับที่ระดับ server: AI/automation ตั้งสถานะ `approved`/`published` ไม่ได้ (guardrail `via === 'ui'`)
- **Compliance เป็น first-class** — Banned Words (Thai อย./health/finance), restricted claims ต่อสินค้า/แบรนด์, Rights/Legal, QC review — ป้องกันคลิปโดนแบน
- **ต้นทุน AI ต้องวัดและ accountable** — ทุกการใช้ AI ผูกกับงานจริง (mandatory work-link) + คิดต้นทุนเป็นบาทด้วย blended rate จาก ledger จริง
- **ความ consistent คือมูลค่า** — Interaction Library + Blueprints + presets = controlled vocabulary ให้ output AI สม่ำเสมอ ทำซ้ำได้

---

## 8. Non-Goals & ข้อจำกัด

**ตัดออกชัดเจน (decision log D1–D10):**
- ❌ **SaaS / multi-tenancy** (D2) — single-tenant, ไม่มี `workspace_id`
- ❌ **PDPA module** (D1)
- ❌ **Import tool** (D10) — ข้อมูลเก่าป้อนใหม่ผ่าน AI wizard
- ❌ **GPT Actions** — ใช้ MCP เป็นทางเชื่อม automation เดียว
- ❌ **White-label / platform features** — ทำแค่ Brand Book เป็น data

**Out of scope (PRD §4.2):** auto-post ทุกแพลตฟอร์มระดับ production, scraping ที่ผิด ToS, payment/billing module, Client Approval Portal, media rendering engine, การเทรน AI model ในระบบ, real-time live control dashboard

**ข้อจำกัดปัจจุบัน:**
- วิดีโอเก็บเป็น **Google Drive link** (ไฟล์ใหญ่เกินอัปเข้าระบบ)
- Performance data = ป้อนมือ + CSV import (ไม่มี platform API — D6)
- AI ร่าง prompt แล้วมนุษย์ก๊อปไป gen ที่ Google Flow/Grok เอง (ยังไม่เรียก generation API ตรง)

---

## 9. สถานะปัจจุบัน & ความเสี่ยง

**สถานะ:** ระบบ build ไปไกลกว่า PRD ต้นฉบับมาก — โค้ดจริงมีโมดูลที่ PRD ไม่ได้ระบุ (Clip Jobs/affiliate-clips, ai-usage, content-intelligence, interaction library, brand book, image-requests, banned-words) Deploy จริงบน Railway แล้ว

> ⚠️ **หมายเหตุ SSOT:** PRD v0.1/v0.2 บางส่วน **ล้าสมัย** — ให้ยึด [`product-spec.md`](./product-spec.md) (สะท้อนโค้ดจริง) เป็นหลัก, PRD เก่าเป็น historical reference

**ความเสี่ยงหลัก (จาก PRD review):**
1. **IP leak = ความเสี่ยงอันดับ 1** — Prompt + Visual DNA + Character Bible = ความลับทั้งบริษัท → export ต้อง gate ตาม role + watermark + `download_logs`
2. **Prompt เสื่อมค่าถ้าไม่ผูกกับ platform/model version** — แพลตฟอร์ม AI เปลี่ยนทุก 2–3 เดือน prompt ที่เคยเวิร์กพัง
3. **Adoption risk** — "ระบบแบบนี้ล้มเพราะ adoption บ่อยกว่า bug"

**คำถามที่ยังเปิด:** LLM cost ceiling/เดือน, RPO/RTO ตอน Live, ลำดับ build content-intelligence, search จริงใช้ SQL ILIKE (Meilisearch เป็น upgrade ทีหลัง)

---

## 10. ก้าวถัดไป

เอกสารนี้กับ [`product-spec.md`](./product-spec.md) เป็นฐานให้ทีมเดินต่อ:
- ใช้ตัดสินใจ scope/priority รอบถัดไป
- ใช้ onboard คนใหม่ / ให้ AI เป็น context
- ทุกครั้งที่ระบบเปลี่ยน direction → อัปเดตที่นี่ก่อน

---

*Reverse-engineered 2026-07-21 จาก apps/api (NestJS), apps/web (Next.js), extension/aistar-flow, prisma/schema.prisma (37 migrations) และ _docs/ PRD ชุดเดิม*
