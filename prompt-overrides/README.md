# prompt-overrides/ — พรอมป์สูตรคลิปที่แก้เอง (backup จาก database)

โฟลเดอร์นี้คือ **backup ของพรอมป์/สูตรคลิปที่แก้เองผ่านหน้าแอป** ซึ่งปกติเก็บอยู่ในตาราง `system_settings` ของ database (ไม่ใช่ในโค้ด) — export ออกมาเพื่อให้ commit เข้า git ได้

> พรอมป์ **ค่าเริ่มต้น (built-in)** อยู่ในโค้ดที่ `apps/api/src/affiliate-clips/` (`review-recipes.ts`, `packaging-prompts.ts`) — ไฟล์ในโฟลเดอร์นี้คือส่วนที่ผู้ใช้ **แก้ทับ/เพิ่มเอง**

## ไฟล์

- [`ugc-settings.json`](ugc-settings.json) — ข้อมูลทั้งหมด แบ่ง 3 กลุ่ม:

| กลุ่ม | คือ | จำนวน |
|------|-----|-------|
| `templateOverrides` | สูตรคลิป/แพ็กเกจ/บล็อกฉาก/พรอมป์รายช่วง ที่แก้เอง (ระดับ template) | 4 คีย์ |
| `perJobOverrides` | การแก้รายคลิป (`ugc.scenelen.*` ความยาวฉาก, `ugc.shotfix.*` แก้ช็อต) ต่อ clip-job | 130 คีย์ |
| `otherUgcSettings` | ค่าตั้ง ugc อื่น ๆ | 1 คีย์ |

### `templateOverrides` (ส่วนสำคัญที่สุด)

| คีย์ | เก็บอะไร |
|------|---------|
| `ugc.recipes.overrides` | สูตรรีวิวที่แก้เอง (เช่น `product/beauty`, `product/toothpaste` — sceneFlow + promptEmphasis + negative) |
| `ugc.packaging.overrides` | พรอมป์รูปแบบแพ็กเกจที่แก้เอง |
| `ugc.sceneblocks.overrides` | บล็อกฉากที่แก้เอง |
| `ugc.sectionprompts.overrides` | พรอมป์รายช่วงที่แก้เอง |

## วิธี export ใหม่ (อัปเดต backup)

รันตอน API/Postgres ยังไม่ต้องเปิดก็ได้ ขอแค่ Postgres รันอยู่ (`localhost:5432`):

```bash
# ต้องมี pg driver — ติดตั้งครั้งเดียว: npm i pg
node scripts/export-prompt-overrides.js prompt-overrides
```

> ไฟล์นี้ export เฉพาะคีย์ที่ **ไม่ใช่ secret** (กรอง `isSecret` + คำที่เข้าข่าย key/token/password ออก)

## วิธีนำกลับเข้า (restore)

อ่านค่าแต่ละคีย์จาก `ugc-settings.json` แล้ว `UPSERT` กลับเข้า `system_settings` (คีย์เดิม, value เป็น JSON string) — หรือใช้ผ่าน API settings ของแอป

> ⚠️ ค่านี้เป็น snapshot ณ เวลา export — ถ้าแก้พรอมป์บนแอปเพิ่ม ต้อง export ใหม่แล้ว commit
