# Dashboard — Requirements (เก็บไว้ ยังไม่ build)

> สถานะ: **Requirement** — เคาะโครงแล้ว รอสั่ง build ภายหลัง
> ผู้ใช้หลัก: **ภาพรวมทั้งทีม** (ทุก role เปิดได้) แต่ **role-aware** บางส่วน
> วันที่บันทึก: 2026-07-11

## ข้อกำหนดสำคัญ (ห้ามพลาด)
- **ยอด GMV / รายได้ / กำไร ต้องเห็นเฉพาะ CEO/founder** — widget การเงินทั้งหมด (GMV เดือนนี้, กราฟ GMV, Top presenter by GMV, มูลค่า pipeline เป็นเงิน, รายได้งานรับจ้าง) ต้อง gate ด้วย permission/role ไม่ให้ทีมทั่วไปเห็นตัวเลขเงิน
  - ทีมทั่วไป: เห็น widget เดียวกันแต่ซ่อนตัวเลขเงิน (แสดงเป็นจำนวนงาน/ชิ้น/สถานะแทน) หรือซ่อน widget การเงินไปเลย
  - แนวทาง: เพิ่ม permission module ใหม่ เช่น `finance` (V) ให้เฉพาะ admin/founder แล้วเช็คก่อน render/return ตัวเลขเงิน

## โครง Dashboard (5 กลุ่ม)

### 1. แถบ KPI สรุป (บนสุด)
| Widget | Data source (มีอยู่แล้ว) | Role |
|---|---|---|
| GMV เดือนนี้ + เทียบเดือนก่อน | `performance/overview` | **CEO เท่านั้น** |
| งานรับจ้างกำลังผลิต + มูลค่า pipeline | `jobs` (นับ status; ยอดเงิน = CEO) | ทีม (ยอดเงิน = CEO) |
| คอนเทนต์เผยแพร่สัปดาห์นี้ + ไลฟ์วันนี้ | `content-items` + `live-sessions` | ทีม |
| Character พร้อมใช้ / รออนุมัติ | `characters/stats` | ทีม |

### 2. ต้องรีบจัดการ (Action needed) — หัวใจ
- งาน/deliverable เลยกำหนด ← `tasks` + `jobs` (dueDate < วันนี้)
- รออนุมัติ — character/content/prompt status = `internal_review`
- QC ค้างตรวจ ← `qc/summary`
- Deliverable รอลูกค้าตรวจรับ ← `jobs` deliverables
- ลิขสิทธิ์ใกล้หมดอายุ / risk สูง ← `rights`

### 3. Production pipeline (แถบตามสถานะ)
- Jobs / Episodes / Content แยกเป็นแถบนับตาม status ← list endpoints เดิม

### 4. Performance / รายได้ (**CEO เท่านั้น**)
- กราฟ GMV รายวัน + Top presenter (GMV) + Top products ← `performance`
- (เฟส 2) รายได้งานรับจ้างเดือนนี้ vs เป้า + กำไรต่องาน ← ต้องต่อ **Jobs finance (เฟส 2)** ก่อน

### 5. สัปดาห์นี้ + กิจกรรมล่าสุด
- ปฏิทินรวม (publish / live / job due) ← calendar endpoints
- Activity feed ← `auditLog` / `notifications`

## งานที่ต้องทำตอน build
1. **เพิ่ม endpoint `/dashboard`** ตัวเดียวที่รวบยอดทุก widget (กันเรียก API 10 ตัวพร้อมกัน) — respect role: ตัวเลขเงินใส่มาเฉพาะเมื่อ user มีสิทธิ์
2. เพิ่ม permission `finance` (หรือใช้ role check) สำหรับ gate ตัวเลขเงิน
3. หน้า `/dashboard` (web) + เพิ่มเป็นหน้าแรกหลัง login
4. รายได้/กำไรงานรับจ้าง = รอ **Jobs เฟส 2** (dashboard เงิน/quote/กำไรต่องาน)

## ความพร้อม
~80% ของ widget ดึงจาก endpoint ที่มีอยู่แล้ว ทำได้ทันที เหลือ `/dashboard` aggregator + role-gating เงิน + Jobs finance (เฟส 2)
