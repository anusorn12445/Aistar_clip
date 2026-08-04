import { BadRequestException } from '@nestjs/common';
import { AssetsService } from '../assets/assets.service';
import { CAPTURE_IMAGE_MEDIA_TYPES } from './dto/character-capture.dto';

// Shared helper: โหลดรูปจาก dto → base64 blocks สำหรับส่งให้ Claude (multimodal)
// ใช้ร่วมกันระหว่าง reverse-capture (ai-character-capture) และ spec-verify
// (ai-character-spec-verify) — พฤติกรรม/ข้อจำกัดเดิมทุกอย่าง: 4MB/รูป, สูงสุด 8 รูป,
// imageAssetIds (ทางหลัก) ก่อน แล้วต่อด้วย imageBase64 (สำรอง)

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // รูปที่ส่งให้ Claude (~4MB ต่อรูป)
export const MAX_IMAGES = 8;

export type ClaudeImageMediaType = (typeof CAPTURE_IMAGE_MEDIA_TYPES)[number];

export interface ResolvedCaptureImage {
  mediaType: ClaudeImageMediaType;
  data: string; // base64
}

export async function resolveCaptureImages(
  assets: AssetsService,
  dto: {
    imageAssetIds?: string[];
    imageBase64?: { mediaType: ClaudeImageMediaType; data: string }[];
  },
): Promise<ResolvedCaptureImage[]> {
  const out: ResolvedCaptureImage[] = [];

  for (const assetId of dto.imageAssetIds ?? []) {
    const asset = await assets.get(assetId); // 404 ถ้าไม่มี
    if (!(CAPTURE_IMAGE_MEDIA_TYPES as readonly string[]).includes(asset.mimeType)) {
      throw new BadRequestException(
        `asset ${assetId} ไม่ใช่รูปที่รองรับ (${asset.mimeType}) — รองรับ ${CAPTURE_IMAGE_MEDIA_TYPES.join(', ')}`,
      );
    }
    if (asset.fileSize > MAX_IMAGE_BYTES) {
      throw new BadRequestException('รูปใหญ่เกิน 4MB — ย่อรูปก่อนแล้วลองใหม่');
    }
    const { stream } = await assets.getFileStream(assetId);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    out.push({
      mediaType: asset.mimeType as ClaudeImageMediaType,
      data: Buffer.concat(chunks).toString('base64'),
    });
  }

  for (const img of dto.imageBase64 ?? []) {
    const buffer = Buffer.from(img.data, 'base64');
    if (buffer.byteLength === 0) throw new BadRequestException('imageBase64.data ไม่ใช่ base64 ที่ถูกต้อง');
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new BadRequestException('รูปใหญ่เกิน 4MB — ย่อรูปก่อนแล้วลองใหม่');
    }
    out.push({ mediaType: img.mediaType, data: buffer.toString('base64') });
  }

  if (out.length > MAX_IMAGES) {
    throw new BadRequestException(`ส่งรูปได้สูงสุด ${MAX_IMAGES} รูปต่อครั้ง`);
  }
  return out;
}
