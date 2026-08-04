# Brand Book (ฝั่งลูกค้า) — Requirement (ร่าง รอเคาะ)

> สถานะ: **ร่าง** — พี่ทัศน์ขอ Brand Book ครบถ้วนสำหรับลูกค้า อ้างอิงแนว GoFlow
> **แหล่งอ้างอิง:** SRS จริงจากพี่ทัศน์ — `/Users/thuspawat/Sites/localhost/Birthmark/_docs/JangKert-Branding-SRS.md` (ระบบ Brand & White-label ของ JangKert/GoFlow-BirthMark)
> **เคาะแล้ว:** ส่วน white-label ตัวแพลตฟอร์ม (FR-B1–B8 ของ SRS) = **ไม่ทำ** — เอาเฉพาะ §2 (Brand Book data spec) มาเสริมโครง Brand Book ของแบรนด์ลูกค้า
> วันที่: 2026-07-14

## บริบท
- Brand Book นี้ผูกกับ **แบรนด์ของลูกค้า** (งานรับจ้างผลิต / Jobs) — ทีมใช้เป็นคัมภีร์ก่อนผลิตคอนเทนต์ให้ลูกค้า และ AI ใช้เป็น context (ต่อจาก `buildBrandContext`)
- ต่อยอดจาก **Content Intelligence ระบบ 1 (Brand Knowledge Base)** ที่ทำแล้ว — ขยายให้ "ครบถ้วน" ระดับ brand book จริง

## สิ่งที่ AISTAR มีแล้ว (ระบบ 1)
brandStory · toneOfVoice · doList · dontList · keyMessages · usp · restrictedClaims · visualIdentity (text ก้อนเดียว) · competitorsNote · กลุ่มเป้าหมาย (BrandAudience) · ไฟล์แนบ (brand book asset)

## ส่วนที่ต้องเพิ่ม (ให้ครบ brand book)

### 1. Brand Foundation (แก่นแบรนด์)
- Mission / Vision / Core Values
- Positioning statement (เราคือใคร ให้ใคร ต่างจากคู่แข่งยังไง)
- Brand personality / archetype (บุคลิกแบรนด์ — เช่น ผู้เชี่ยวชาญ/เพื่อน/ผู้นำเทรนด์)
- Tagline / slogan

### 2. Verbal Identity (อัตลักษณ์ภาษา) — ต่อจาก tone/do-dont เดิม
- Vocabulary: คำที่ใช้ / คำที่ห้ามใช้ (word bank)
- ตัวอย่างประโยค on-brand vs off-brand
- แนวการเขียนต่อแพลตฟอร์ม (FB/TikTok/IG ต่างกันยังไง)

### 3. Visual Identity (อัตลักษณ์ภาพ) — ยกจาก text ก้อนเดียว → มีโครงสร้าง (ตามโครง SRS §2)
- **ชื่อ + วิธีเขียนแบรนด์** (`nameUsage`) — เช่น Jang**Kert** เน้น syllable ที่สอง, ตัวพิมพ์ที่ถูกต้อง
- **สโลแกน/tagline + ฟอนต์สโลแกน** (`tagline`, `taglineFont`) — เช่น "Creator of Everything" + Great Vibes
- **โลโก้:** ไฟล์หลาย version (full/icon/mono ผ่าน asset) + **spec + กติกาการใช้** (`logoUsageNote`: ใช้ตรงไหนแบบไหน เช่น sidebar มีสโลแกน / login ไม่มี) + ตัวอย่าง misuse
- **สี palette เป็นตาราง token** (แบบ §2.3): token / ค่า Dark / ค่า Light / ใช้ทำอะไร — เก็บ structured (JSON หรือตาราง `BrandColor`) ไม่ใช่ text ลอย
- **ฟอนต์แยกบทบาท** (แบบ §2.4): heading / body / display+สโลแกน (+ฟอนต์ไทย เช่น Noto Sans Thai/Sarabun)
- **ภาพ/มู้ด:** สไตล์ภาพถ่าย/กราฟิก + do/don't ตัวอย่าง
- **ไอคอน/ลาย/กราฟิกเอลิเมนต์**

### 4. Application / Templates (ตัวอย่างการใช้จริง)
- เทมเพลตโพสต์โซเชียล · แพ็กเกจจิ้ง · สไลด์ · ตัวอย่าง do/don't พร้อมภาพ

### 5. Governance (การกำกับ)
- เจ้าของแบรนด์/ผู้อนุมัติ (contact) · เวอร์ชัน brand book · วันที่อัปเดต

## แนวทาง implement (เสนอ)
- ขยาย `Brand` (หรือแยกตาราง `BrandBookSection` แบบยืดหยุ่น) รองรับหมวดข้างบน — visual identity เปลี่ยนจาก text เดียวเป็น structured (สี/ฟอนต์/โลโก้ asset)
- โลโก้/เทมเพลต/ภาพตัวอย่าง = reuse asset system (entityType 'brand', linkRole ตามชนิด)
- หน้า Brand Book: มุมมองอ่าน (คัมภีร์สวยๆ พร้อม export PDF) + มุมมองแก้ไข
- AI: ฉีดทุกหมวดเข้า `buildBrandContext` → คอนเทนต์ on-brand ครบขึ้น
- ผูกกับ **Client/Jobs** — แต่ละลูกค้ามี Brand Book ของแบรนด์ตัวเอง

## เคาะครบแล้ว (2026-07-14)
1. **โครง:** ใช้ SRS JangKert §2 เสริมหมวด Visual · **white-label แพลตฟอร์ม = ไม่ทำ**
2. **จุดผูก:** ต่อยอด **Brand เดิม** (Brand Knowledge ที่มี) — ลูกค้าใช้ผ่าน Client.brandId ที่มีอยู่ ไม่ซ้ำซ้อน, AI ใช้ buildBrandContext ตัวเดียว
3. **Export PDF:** เอา แต่เป็น **เฟส 2** — เฟสแรกมุมมองอ่านบนเว็บ (แชร์ลิงก์ภายใน)
4. **คิว:** **เก็บ requirement ไว้ก่อน** — ยังไม่ลงมือ (คิวปัจจุบัน: Prompt Library A+B ก่อน) หยิบมาทำเมื่อพี่ทัศน์สั่ง
