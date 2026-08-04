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

## นำเข้าอัตโนมัติตอน setup (พร้อมใช้เลย) ✅

พรอมป์ระดับ template (recipes / packaging / sceneblocks / sectionprompts) ถูกฝังไว้ที่
[`apps/api/prisma/seed-data/ugc-prompt-overrides.json`](../apps/api/prisma/seed-data/ugc-prompt-overrides.json)
และ `prisma:seed` จะโหลดเข้า `system_settings` ให้อัตโนมัติ — **ติดตั้งใหม่แล้วได้พรอมป์ที่ปรับไว้เลย**

```bash
pnpm --filter api prisma:seed   # จะ seed พรอมป์ override ให้ด้วย (create-if-absent)
```

- **create-if-absent** — ถ้าคีย์นั้นมีอยู่แล้วใน DB จะไม่ทับ (กัน clobber ค่าที่แก้สด)
- อยากอัปเดตค่าที่ commit ไว้ให้ DB เดิม → แก้ผ่านหน้าแอป หรือลบคีย์นั้นก่อน seed ใหม่

## อัปเดต backup เมื่อแก้พรอมป์เพิ่ม

```bash
node scripts/export-prompt-overrides.js prompt-overrides                       # 1) ดึงจาก DB
node -e 'const fs=require("fs");const d=require("./prompt-overrides/ugc-settings.json");fs.writeFileSync("apps/api/prisma/seed-data/ugc-prompt-overrides.json",JSON.stringify(d.templateOverrides,null,2))'  # 2) อัปเดตไฟล์ seed
git add -A && git commit -m "chore: update clip-recipe prompts"                # 3) commit
```

> ⚠️ ค่านี้เป็น snapshot ณ เวลา export — ถ้าแก้พรอมป์บนแอปเพิ่ม ต้องทำ 3 ขั้นข้างบนแล้ว commit
