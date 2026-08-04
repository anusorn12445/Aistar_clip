# Deploy AISTAR Talent OS ขึ้น Railway

ระบบมี 3 service: **Postgres** + **API** (NestJS) + **Web** (Next.js) จาก repo เดียว
สิ่งที่ผมเตรียมให้แล้ว: `Dockerfile.api`, `Dockerfile.web`, `.dockerignore`, `.env.example`, CORS/port แบบ config ได้

> ตัว deploy จริง + การใส่ secret ทั้งหมดต้องทำบน Railway เอง (ผมใส่ค่าลับให้ไม่ได้)

---

## ก่อนเริ่ม
- มีบัญชี Railway + เชื่อม GitHub แล้ว

### สเต็ป 0 — push repo ขึ้น GitHub (ตอนนี้ยังไม่มี remote)
repo นี้ยัง commit อยู่ในเครื่องล้วน ยังไม่มี GitHub remote — Railway ต้อง deploy จาก GitHub ทำครั้งเดียว:
1. สร้าง repo เปล่าใน GitHub (private) เช่น `aistar-talent-os` — **อย่าเพิ่งใส่ README/gitignore**
2. ในเครื่อง (โฟลเดอร์นี้):
   ```
   git remote add origin git@github.com:<user>/aistar-talent-os.git
   git push -u origin main
   ```
   (ถ้ามี `gh` CLI ล็อกอินแล้ว จะใช้ `gh repo create aistar-talent-os --private --source=. --push` แทนก็ได้)
> `.gitignore` กัน `.env` / `storage/` ไว้แล้ว — secret จะไม่หลุดขึ้น GitHub

---

## ขั้นตอน (ทำตามลำดับ)

### 1) สร้าง Project + Postgres
1. Railway → **New Project** → **Deploy PostgreSQL**
2. รอ Postgres ขึ้น — มันจะมีตัวแปร `DATABASE_URL` ให้อ้างอิงได้

### 2) สร้าง API service
1. ในโปรเจกต์เดิม → **New** → **GitHub Repo** → เลือก repo นี้
2. Service Settings:
   - **Build → Dockerfile Path**: `Dockerfile.api`
   - **Root Directory**: `/` (repo root — จำเป็นเพราะเป็น pnpm workspace)
3. Variables (ตั้งตาม `.env.example` ฝั่ง API):
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (อ้างอิง service Postgres)
   - `JWT_SECRET` = สุ่มยาว ๆ → รัน `openssl rand -base64 48` แล้ววาง
   - `CORS_ORIGIN` = โดเมน web (ยังไม่รู้ตอนนี้ — เว้นไว้ก่อน กลับมาใส่ทีหลังในสเต็ป 5)
   - `STORAGE_DIR` = `/data/storage`
   - `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (จะใส่ทีหลังในหน้า Settings ก็ได้)
4. **Volume (สำคัญ — กันไฟล์อัปโหลดหาย):** service API → **Volumes → New Volume** → mount path `/data`
   - ถ้าไม่ผูก volume: รูป/ไฟล์ที่อัปโหลดจะหายทุกครั้งที่ redeploy (container filesystem ชั่วคราว)
   - **Healthcheck (แนะนำ):** Settings → Deploy → **Healthcheck Path** = `/api/health` (endpoint สาธารณะ ตอบ `{status:'ok',db:'up'}` — Railway จะรอให้ service พร้อมก่อนสลับ traffic)
5. Deploy → เปิด **Settings → Networking → Generate Domain** เพื่อได้โดเมน public ของ API
   (เช่น `https://aistar-api-production.up.railway.app`)

### 3) Seed ข้อมูลเริ่มต้น (ทำครั้งเดียว)
migration รันอัตโนมัติตอน start แล้ว แต่ต้อง seed roles + admin ครั้งแรก:
- Railway → API service → เมนู **⋮ → Shell** (หรือ `railway run` ผ่าน CLI) แล้วรัน:
  ```
  cd /app/apps/api && pnpm prisma:seed
  ```
- Admin เริ่มต้น: `admin@aistar.local` / `aistar-admin-2026` → **ล็อกอินแล้วเปลี่ยนรหัสทันที**

### 4) สร้าง Web service
1. **New → GitHub Repo** → repo เดิม (service ที่ 2 จาก repo เดียวกัน)
2. Service Settings:
   - **Dockerfile Path**: `Dockerfile.web`
   - **Root Directory**: `/`
3. Variables:
   - `NEXT_PUBLIC_API_URL` = `https://<โดเมน-API-จากสเต็ป-2>/api`
   - ⚠️ ตัวนี้ถูกฝังตอน **build** — ต้องตั้ง **ก่อน** deploy web (ถ้าเปลี่ยนทีหลังต้อง redeploy)
4. Deploy → **Generate Domain** ได้โดเมน web
   (เช่น `https://aistar-web-production.up.railway.app`)

### 5) ปิดวง CORS
1. กลับไปที่ **API service → Variables** → ตั้ง `CORS_ORIGIN` = โดเมน web จากสเต็ป 4
2. API จะ redeploy เอง — เสร็จแล้วเปิดเว็บล็อกอินได้เลย

---

## เช็กลิสต์หลัง deploy
- [ ] เปิดโดเมน web → หน้า login ขึ้น
- [ ] ล็อกอิน admin ได้ (แปลว่า API + DB + CORS + seed ครบ)
- [ ] เปลี่ยนรหัส admin
- [ ] อัปโหลดรูป 1 รูป → redeploy → รูปยังอยู่ (พิสูจน์ว่า Volume ทำงาน)
- [ ] หน้า Settings ใส่ `ANTHROPIC_API_KEY` (หรือไว้ที่ env) → ทดสอบ AI wizard

---

## ข้อควรรู้ / ข้อจำกัด
- **Storage**: ตอนนี้เก็บไฟล์บน disk (ผ่าน Volume). ถ้าจะสเกล/สำรองนอกเครื่อง → ทำ R2 driver (task ที่ค้างอยู่) แล้วกรอกค่า R2 ในหน้า Settings
- **Backup DB**: Railway มี backup ของ Postgres plugin — เปิดใช้/ตั้ง schedule เพิ่มได้; หรือใช้ `scripts/backup.sh` แบบ pg_dump ก็ได้
- **ค่าใช้จ่าย**: 3 service (Postgres + API + Web) + Volume — Railway คิดตาม usage
- **เปลี่ยน `NEXT_PUBLIC_API_URL` = ต้อง redeploy web** เสมอ (ค่าถูก inline ตอน build)
- โดเมนของตัวเอง: Railway → service → **Settings → Networking → Custom Domain**
