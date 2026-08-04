# Content Intelligence Loop — 4 ระบบใหม่ (วิเคราะห์ไว้ ยังไม่ implement)

> สถานะ: **วิเคราะห์เสร็จ** — รอเคาะลำดับ/รายละเอียด แล้วออกแบบหน้าจอ + implement
> วันที่: 2026-07-13

4 ระบบต่อกันเป็น **วงจรปิด**: ความรู้แบรนด์ → คิดคอนเทนต์ → สตอรีบอร์ด → วิเคราะห์ผล → เรียนรู้แล้ววนกลับ

## 1. ฐานความรู้แบรนด์ (Brand Knowledge Base) — ใหม่
ปัจจุบัน Brand เก็บแค่ name/contact/notes → AI ไม่รู้จักตัวตนแบรนด์
- **เพิ่ม data ต่อ Brand:** brand story, tone of voice, do/don't, key messages, USP, กลุ่มเป้าหมาย (ผูก AudienceSegment), คำต้องห้าม/claim ห้ามเคลม, อัตลักษณ์ภาพ (สี/มู้ด), คู่แข่ง, เอกสารแนบ (brand book ผ่าน asset entityType 'brand')
- **AI ใช้:** เป็น context ฉีดเข้า prompt ทุกครั้งที่ระบบ 2/3 ทำงาน → output on-brand อัตโนมัติ
- **ต่อของเดิม:** Brand, AudienceSegment, Product.restrictedClaims, Competitors, asset system

## 2. คิดคอนเทนต์อัตโนมัติ (AI Content Ideation) — ใหม่ (หัวใจ)
- **Input:** ความรู้แบรนด์ (1) + กลุ่มเป้าหมาย + ผลงานที่เวิร์ค (จาก 4) + ตัวละคร/สินค้า + เทรนด์/คู่แข่ง + **เสียงลูกค้า (VoC — ดูด้านล่าง)**
- **Output:** ไอเดียหลายอัน แต่ละอัน: hook, angle, แพลตฟอร์ม, ฟอร์แมต, ตัวละคร/สินค้า, แนวแคปชั่น → บันทึกเป็น ContentItem (status=idea) หรือ Idea board
- **ต่อของเดิม:** ai.service (endpoint ใหม่ `ai/content/ideate`), มี weekly-plan + caption อยู่แล้ว, ContentPerformance, Idea Library

### 2.0 โหมดการคิด — Auto / Guided / Iterate (human-in-the-loop)
ไม่ใช่ AI คิดเองล้วน — ให้คนโยนไอเดียเข้าไปให้ AI ประมวลผลได้ด้วย
- **คนโยนได้:** ไอเดียดิบ/brief, คีย์เวิร์ด/เทรนด์, โจทย์/ทิศทาง — หรือ **ดึงจาก Idea Library ที่มีอยู่** (💡 idea module) มาโยนเข้า AI
- **AI ประมวลผล:** seed ที่โยน + context ทั้งหมด (แบรนด์ + เสียงลูกค้า + performance + audience) → ขยายเป็นไอเดียเต็มหลายแบบ + เหตุผล
- **3 โหมด:** Auto (AI คิดเองจาก data) · Guided (คนโยน seed → AI ต่อยอด) · Iterate (คนคอมเมนต์ไอเดีย AI → AI ปรับ)
- **ต่อของเดิม:** Idea Library (idea module) เป็นที่เก็บ seed, ai.service, ContentItem

### 2.1 Customer Voice (เสียงลูกค้า) → ป้อนเข้า Ideation
- **แหล่ง feedback 3 ทาง:** 💬 comment (โซเชียล — วาง/import CSV/อนาคต API) · 📩 แชท (ลูกค้าทัก) · 🧑‍💼 sale สรุปหน้างาน
- **ตาราง `CustomerFeedback` ใหม่:** text, source (comment/chat/sales_note), sourceRef?, brandId?/productId?/characterId?/contentItemId? (ผูกที่เกี่ยว), sentiment (AI จัด: positive/negative/neutral), themes[] (AI แตก), createdBy, createdAt
- **AI 2 จังหวะ:** (1) ตอนบันทึก → จัด sentiment + แตก theme อัตโนมัติ (เช่น "ถามวิธีใช้", "บ่นราคา", "อยากได้สีใหม่", "ชมพรีเซนเตอร์") (2) ตอน ideate → ดึง theme ที่ถูกพูดถึงบ่อย/เชิงลบ → คิดคอนเทนต์ที่ตอบเสียงลูกค้าจริง
- **ของแถม:** mini-dashboard เสียงลูกค้า (theme ยอดฮิต + เทรนด์ sentiment) + เชื่อม Client/Jobs (feedback จากงานรับจ้าง) + มุม Sanji (customer relations)
- **ต่อของเดิม:** Brand, Product, Character, ContentItem, Client/Jobs, ai.service

## 3. สคริปต์ → Storyboard — ต่อยอด ~70%
ของเดิม: AI `shot-list` แตก script → Shot (camera/action/dialogue/duration) = โครงสตอรีบอร์ดแล้ว
- **เพิ่ม:** image prompt ต่อช็อต (ใช้ Visual DNA ตัวละคร + Location) → คนก๊อปไป gen ใน Grok/ChatGPT → อัปโหลดเฟรมกลับ (asset) + **หน้า Storyboard** แสดงลำดับช็อตแบบการ์ตูนช่อง (ภาพ+บท+มุมกล้อง)
- **ต่อของเดิม:** Episode/Shot, Character Visual DNA (buildImagePrompt มีแล้ว), Location, asset

## 4. วิเคราะห์คอนเทนต์ที่เคยทำ (Content Analytics) — ใหม่ (ปิดวง)
- **Input:** ContentItem + ContentPerformance (views/likes/ctr/gmv) + ตัวละคร/สินค้า/กลุ่มเป้าหมาย/แพลตฟอร์ม/เวลา
- **Output:** insight — hook/ฟอร์แมต/ตัวละคร/เวลาไหนผลดีสุด, pattern, คำแนะนำ → ป้อนกลับระบบ 2 + อัปเดตความรู้แบรนด์
- **ต่อของเดิม:** Performance, ContentPerformance, dashboard top-presenter-by-GMV

## จุดที่ต้องเคาะก่อน implement
1. **ลำดับ:** แนะนำ 1→2→3→4 (ฐานความรู้ก่อน เพราะ 2/3/4 ต้องใช้) — หรือเอา 3 ก่อน (quick win, ต่อยอด 70%)
2. **แหล่งข้อมูล AI:** จากในระบบก่อน (performance/audience/สินค้า) หรือดึงเทรนด์นอก (web search) ด้วย
3. **gen ภาพ storyboard:** AI ร่าง prompt ให้คนไป gen เอง (ตรงแนวปัจจุบัน) หรือต่อ image API gen ในระบบเลย

## ประเมินความหนัก
- ระบบ 3 เบาสุด (ต่อยอด shot-list เดิม), ระบบ 1 เป็นฐานของ 2/3/4, ระบบ 2+4 เป็นคู่ป้อนกลับ (ควรทำใกล้กัน)
