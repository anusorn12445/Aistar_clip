# Veo Prompt Builder — คู่มือติดตั้ง

ระบบมี 2 ส่วน:

1. **Chrome Extension** — ดึงข้อมูล/รูปสินค้าจาก Shopee
2. **Web Builder** — สร้าง prompt + generate ภาพ/วิดีโอ

---

## 📦 ส่วนที่ 1: ติดตั้ง Chrome Extension

### ขั้นตอน

1. เปิด Chrome → พิมพ์ `chrome://extensions` ที่ address bar
2. เปิด toggle **"Developer mode"** (มุมขวาบน)
3. กด **"Load unpacked"**
4. เลือก folder `veo-extension/`
5. ✅ Extension โหลดเสร็จ — เห็น icon "Veo Scraper" ที่ toolbar

### วิธีใช้

1. เปิดหน้าสินค้า Shopee (URL แบบ `shopee.co.th/product-name-i.XXX.YYY`)
2. เห็นปุ่มลอย **"Scrape to Veo Builder"** มุมขวาล่าง — หรือกด extension icon ที่ toolbar
3. กด **"Scrape current page"** — extension จะดึง:
   - ชื่อสินค้า
   - ราคา
   - คำอธิบาย
   - รูปทั้งหมด
   - ชื่อร้าน
4. เลือกรูปที่ต้องการ (default = เลือก 4 รูปแรก) — คลิกที่ thumbnail
5. กด **"Send to Prompt Builder"** — data ถูก copy ไป clipboard

---

## 🖥️ ส่วนที่ 2: เปิด Web Builder

1. เปิดไฟล์ `veo-prompt-builder.html` ใน browser
2. ที่มุมขวา section **"Product Reference"** → กด **"Paste from clipboard"**
3. ข้อมูลสินค้า + รูปจะโหลดเข้ามาอัตโนมัติ

---

## 🔑 ส่วนที่ 3: ตั้งค่า API สำหรับ Generate Image/Video

### รับ API key

1. ไปที่ https://aistudio.google.com/apikey
2. Log in ด้วย Google account
3. กด **"Create API key"**
4. Copy key (ขึ้นต้นด้วย `AIza...`)

### ตั้งค่าใน Builder

1. ในหน้า Builder → section **"Generate Media"** → กด **"API Settings"**
2. Paste API key ลงช่อง **"Google Gemini API Key"**
3. เลือก:
   - **Image Model:** Imagen 3 (แนะนำ) / Imagen 4 (preview) / Gemini 2.0 Flash
   - **Video Model:** Veo 3 (preview) / Veo 2
   - **Aspect Ratio:** 9:16 (สำหรับ TikTok/Reels)
4. กด **"Save"**

### ใช้งาน

- **Generate Image** — สร้างภาพจาก prompt ปัจจุบัน (ใช้ scene ที่ active)
- **Generate Video** — สร้างวิดีโอ 8 วิ (Veo — ใช้เวลา 30 วิ - 5 นาที)

---

## ⚠️ ข้อจำกัด + คำเตือน

### เรื่อง Shopee Scraping

- **Selectors อาจล้าสมัย** — Shopee เปลี่ยน UI บ่อย ต้องอัปเดต `content.js` เมื่อ scrape พัง
- **ห้าม scrape เยอะเกิน** — Shopee อาจ block IP
- **ใช้กับสินค้าของ client เอง** — ปลอดภัยที่สุด

### เรื่อง API cost

- **Imagen 3:** ~$0.03/image
- **Imagen 4:** ~$0.04/image
- **Veo 3:** ~$0.35-0.75/video (8 วินาที)
- **Veo 2:** ~$0.35-0.50/video

**ทางที่ประหยัด:**
1. เขียน prompt ให้ชัดก่อน (ผ่าน builder)
2. Generate image ทดสอบ concept ก่อน (~$0.03)
3. ถ้าดี ค่อย generate video

### เรื่อง API key security

- Key เก็บใน **localStorage ของ browser** เท่านั้น
- **ไม่ถูกส่งไปที่ไหน**นอกจาก Google API endpoints
- ถ้าใช้เครื่องแชร์ → กด **API Settings** → ลบ key ก่อนออก

---

## 🐛 Troubleshooting

### "Content script ไม่ตอบ"
- Refresh หน้า Shopee → ลอง scrape ใหม่
- Extension ต้อง reload ถ้าแก้ code

### "Scrape ได้ 0 รูป"
- Shopee update UI → เปิด DevTools → หา selectors ใหม่ → แก้ `content.js`
- ในไฟล์ `content.js` มี `SELECTORS` object ที่แก้ได้ง่าย

### "Image generation error 400"
- Prompt อาจยาวเกิน (Imagen: max ~2000 chars)
- ลดขนาด prompt โดยปิด NEGATIVE บางอัน

### "Video generation timeout"
- Veo ใช้เวลานาน — บาง prompt ใช้ถึง 5-10 นาที
- ถ้า timeout → ลองใหม่หรือลด complexity ของ prompt

### "CORS error"
- Google API รองรับ CORS อยู่แล้ว
- ถ้ายังเจอ → ตรวจสอบ API key ว่า enable Generative Language API แล้ว

---

## 📁 โครงสร้างไฟล์

```
veo-builder/
└── index.html                    ← Web Builder (เปิดใน browser)

veo-extension/
├── manifest.json                 ← Extension config
├── content.js                    ← Scraper logic (แก้ selectors ที่นี่)
├── background.js                 ← Service worker
├── popup.html                    ← Extension popup UI
├── popup.js                      ← Popup logic
├── icon-16.png / 48 / 128        ← Icons
└── README.md                     ← ไฟล์นี้
```
