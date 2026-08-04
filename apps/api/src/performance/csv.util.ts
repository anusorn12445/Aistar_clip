// CSV helpers สำหรับ performance import (D6: manual + CSV เท่านั้น — ไม่มี platform API)
// parser แบบ minimal: split ด้วย comma + รองรับ quoted field ("a, b" / "" escape) พอสำหรับไฟล์ export ทั่วไป

export const CSV_COLUMNS = [
  'content_title',
  'platform',
  'recorded_at',
  'views',
  'likes',
  'comments',
  'shares',
  'saves',
  'watch_time_sec',
  'retention_3sec',
  'completion_rate',
  'ctr',
  'product_clicks',
  'add_to_cart',
  'orders',
  'revenue',
  'gmv',
] as const;

export const CSV_TEMPLATE =
  CSV_COLUMNS.join(',') +
  '\n' +
  'รีวิวเซรั่มหน้าใส EP.1,tiktok,2026-07-01,12500,830,45,12,60,45000,0.62,0.35,0.021,320,80,25,12500.00,15900.00\n';

/** ตัด BOM หน้าไฟล์ (Excel ชอบแถมมา) */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** split 1 บรรทัด CSV — รองรับ quoted comma และ "" escape แบบ minimal */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** เลขแบบ lenient: ค่าว่าง → null, ตัด , และ % ทิ้ง, parse ไม่ได้ → null */
export function parseLenientNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[,%\s฿]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseLenientInt(raw: string | undefined): number | null {
  const n = parseLenientNumber(raw);
  return n === null ? null : Math.round(n);
}

/** recorded_at: รับ ISO datetime หรือ YYYY-MM-DD */
export function parseRecordedAt(raw: string | undefined): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
