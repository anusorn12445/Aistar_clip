import { BadRequestException } from '@nestjs/common';

// SSRF guard สำหรับ POST /assets/import-url — server-side fetch รูปจากเว็บภายนอก
// อนุญาตเฉพาะ https + host สาธารณะ (บล็อก localhost/loopback/private/link-local)
// แยกเป็น util เพื่อ unit-test ได้โดยไม่ต้องยิง network จริง

const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /\.localhost$/i,
  /^127\./, // loopback
  /^0\./, // 0.0.0.0/8
  /^10\./, // private class A
  /^192\.168\./, // private class C
  /^169\.254\./, // link-local (รวม cloud metadata 169.254.169.254)
  /^172\.(1[6-9]|2\d|3[01])\./, // private class B (172.16.0.0/12)
];

/** ตรวจ url ที่จะ import: ต้อง https + ไม่ชี้เข้าเครือข่ายภายใน — คืน URL ที่ parse แล้ว */
export function assertSafeImportUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException('url ไม่ถูกต้อง — ต้องเป็นลิงก์เต็ม เช่น https://...');
  }
  if (url.protocol !== 'https:') {
    throw new BadRequestException('รองรับเฉพาะลิงก์ https:// เท่านั้น');
  }
  const host = url.hostname.toLowerCase();
  // IPv6 loopback/unspecified (URL.hostname คืนแบบไม่มี [] เช่น '::1')
  if (host === '::1' || host === '[::1]' || host === '::' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
    throw new BadRequestException('ลิงก์ชี้ไปยังเครือข่ายภายใน — ไม่อนุญาต');
  }
  if (PRIVATE_HOST_PATTERNS.some((re) => re.test(host))) {
    throw new BadRequestException('ลิงก์ชี้ไปยังเครือข่ายภายใน — ไม่อนุญาต');
  }
  return url;
}
