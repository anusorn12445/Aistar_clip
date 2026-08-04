# AI Usage & Cost Accountability — สเปก (เคาะแล้ว รอ implement)

> สถานะ: **เคาะ 3 จุดหลักแล้ว** — รอทีม Affiliate รวมร่างเสร็จ (กัน schema.prisma ชน) แล้วลงมือ
> วันที่เคาะ: 2026-07-13

## ปัญหา (จาก CEO)
ค่า AI subscription รายเดือนแพง (Google Flow / Grok / ตัวใหม่ๆ) token หมดไวแต่งานออกน้อย → สงสัยพนักงานเอา account ไป gen งานส่วนตัว
ต้องการ: พนักงานบันทึกต้นทุน/token ที่ใช้ต่อวัน + กราฟเทียบ "token ที่ใช้ vs ผลงานที่ได้" → เห็นชัดว่าใครเอา account ไปสร้างงานให้บริษัทจริง

## เคาะแล้ว (locked)
1. **ผูกงาน = บังคับทุกครั้ง** — usage log ทุกก้อนต้องผูกกับงานจริงในระบบ (Episode/Shot/ContentItem/Affiliate content). ผูกงานไม่ได้ = บันทึกไม่ได้ → งานส่วนตัวเข้าบัญชีไม่ได้เลย
2. **หน่วย = token/credit + บาท** — เก็บทั้งจำนวน (token/credit) และต้นทุนบาท; เทียบข้าม tool ด้วยบาท
3. **สิทธิ์เห็น** — พนักงานเห็นสถิติ/ต้นทุนของตัวเอง; CEO (admin/founder) เห็นทุกคน (ตารางประสิทธิภาพรายคน)
4. **โมเดลราคา = ตามแพกที่เติมจริง (credit ledger)** — ระบบไม่เดาราคาเอง. บันทึกการเติมเครดิต/จ่าย subscription จริงแต่ละครั้ง (จ่ายกี่บาท ได้กี่ credit/token) → คำนวณ **เรตเฉลี่ยจริง (blended)** ต่อ tool = Σบาทที่จ่าย ÷ Σหน่วยที่ได้ → ใช้ดีดเป็นเงินให้ usage log อัตโนมัติ (แก้ทับได้). ต้นทุนต่อผลงานเลยเป็นต้นทุนจริง รวมค่า subscription ที่จมด้วย ไม่ใช่เรตสมมติ

## Data model (เพิ่มใหม่ — additive)
### AiTool (catalog — จัดการที่ Settings)
- name (Google Flow / Grok / Kling / ...), unit ('token' | 'credit' | 'flat'), status (active/archived), note?
- defaultRateBaht (Float? — เรตสำรองไว้ใช้ตอนยังไม่มี top-up บันทึก; ถ้ามี ledger ใช้ blended จาก ledger แทน)
- เพิ่ม tool ใหม่ได้เรื่อยๆ รองรับ AI ตัวใหม่ในอนาคต

### AiCreditTopup (ledger การเติมจริง — หัวใจของราคาแม่น)
- aiToolId, purchasedAt, amountBaht (Decimal — จ่ายจริง), quantity (Float — credit/token ที่ได้; ถ้า subscription เหมาจ่ายที่ไม่คิดเป็น credit ให้กรอก quantity = โควตาที่ได้/รอบ), note?, createdBy
- **เรตเฉลี่ยจริงต่อ tool (blended)** = Σ amountBaht ÷ Σ quantity (ทั้งหมด หรือช่วงเวลา) → ระบบใช้ตัวนี้ดีด costBaht ให้ usage log
- CRUD (admin) ที่ Settings; แสดงเรตปัจจุบันต่อ tool

### AiUsageLog
- userId (คนใช้), aiToolId, usedAt (วันที่)
- quantity (Float — token/credit ที่ใช้), costBaht (Decimal — ต้นทุนบาท; auto = quantity × เรตเฉลี่ยจริง(blended) ของ tool ตอนบันทึก แก้ทับเองได้)
- outputsCount (Int — จำนวนผลงาน คลิป/ภาพ), outputType ('video' | 'image' | 'other')
- **linkedWork (บังคับ ≥1):** ผูก entityType+entityId (episode/shot/content/affiliate) — reuse pattern assetLink; อาจแยกตาราง AiUsageLink (usageLogId, entityType, entityId, label) เพื่อผูกได้หลายชิ้น
- note?, createdAt

## API
- **AiTool CRUD** (admin) — ใต้ settings module หรือ module ใหม่ ai-usage
- **AiUsageLog:**
  - POST /ai-usage — สร้าง (validate: linkedWork ≥1 มิฉะนั้น 400; ตรวจ entity มีจริง; auto costBaht ถ้าไม่กรอก)
  - GET /ai-usage — list; พนักงานเห็นของตัวเอง, CEO เห็นทุกคน (filter user/tool/ช่วงวันที่)
  - GET /ai-usage/summary — สรุป: ต้นทุนรวม, ผลงานรวม, บาท/ชิ้นเฉลี่ย, ต้นทุนที่ผูก vs ไม่ผูก(ควรเป็น 0 เพราะบังคับ), ตารางรายคน (token/ผลงาน/บาทต่อชิ้น/% ผูกงาน/flag), เทียบ tool. Gate CEO สำหรับ per-person; พนักงาน = ของตัวเอง

## Web
- หน้าใหม่ /ai-usage (nav ใต้ Overview หรือ Publishing/Admin)
  - ฟอร์ม "บันทึกการใช้วันนี้" (tool, จำนวน, บาท, ผลงาน, ผูกงาน [ค้นหา episode/content/affiliate], โน้ต)
  - การ์ดสรุป: ต้นทุน AI เดือนนี้ · ผลงานรวม · บาท/ชิ้นเฉลี่ย · (ต้นทุนไม่ผูกงาน = ควร 0)
  - ตารางประสิทธิภาพรายคน (CEO) — token · ผลงาน · บาท/ชิ้น · % ผูกงาน · flag คุ้ม/ตรวจสอบ
  - กราฟเทียบ tool (บาท/ชิ้น)
- Settings: จัดการ AiTool (เพิ่ม/แก้เรตแปลงบาท)

## Flag logic (จับคนเอา account ไปใช้ส่วนตัว)
- บาท/ชิ้นสูงผิดปกติ (เทียบค่าเฉลี่ยทีม) → เตือน
- token เยอะแต่ outputsCount น้อย → เตือน
- (ผูกงาน = บังคับแล้ว ดังนั้น "ไม่ผูกงาน" ถูกกันตั้งแต่ต้นทาง — flag เน้นที่ efficiency ต่อ token)

## Phase 2 (อนาคต)
- ดึง usage อัตโนมัติจาก API ของ AI tool (ถ้ามี) แทนกรอกมือ
- เชื่อม Performance: ต้นทุนผลิต vs ยอดวิว/GMV ของงานชิ้นนั้น → ROI ต่อคลิป
- งบต่อเดือนต่อคน + แจ้งเตือนเมื่อใกล้เกินงบ
