import { Controller, Get, Param, ParseUUIDPipe, StreamableFile } from '@nestjs/common';
import { BrandsService } from './brands.service';

/**
 * PUBLIC controller — จงใจไม่มี JwtAuthGuard/PermissionsGuard:
 * ลิงก์แชร์ Brand Book ให้ลูกค้าอ่านโดยไม่ต้อง login — ตัว token (crypto-random
 * 48 hex chars, lookup อย่างเดียว ไม่มี brand id ใน URL) คือกุญแจการเข้าถึง
 * และเพิกถอนได้ทันทีด้วย DELETE /brands/:id/share (token = null → 404)
 *
 * NOTE: เฟสนี้ยังไม่ใส่ rate limiting — ถ้าจะเปิดใช้วงกว้าง ควรครอบ
 * @nestjs/throttler (หรือ guard ทำนองเดียวกัน) กัน brute-force token
 */
@Controller('public/brand-book')
export class PublicBrandBookController {
  constructor(private brands: BrandsService) {}

  // book aggregate เวอร์ชันสาธารณะ — ตัด clients / bookApproverContact /
  // contact / notes / productCount / bookShareToken ออก (ดู BrandsService.getPublicBook)
  @Get(':token')
  book(@Param('token') token: string) {
    return this.brands.getPublicBook(token);
  }

  // stream ไฟล์ (โลโก้/เทมเพลต/มู้ด) — เฉพาะ asset ที่ผูกกับแบรนด์ของ token นี้
  @Get(':token/asset/:assetId')
  async asset(
    @Param('token') token: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ): Promise<StreamableFile> {
    const { stream, mimeType, originalFilename, fileSize } =
      await this.brands.getPublicAssetStream(token, assetId);
    // filename อาจเป็นไทย — RFC 5987 filename* กัน header พัง (แบบเดียวกับ assets.controller)
    const encoded = encodeURIComponent(originalFilename).replace(/['()]/g, escape);
    return new StreamableFile(stream, {
      type: mimeType,
      length: fileSize,
      disposition: `inline; filename*=UTF-8''${encoded}`,
    });
  }
}
