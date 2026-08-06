import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CTA_TYPES } from '../review-recipes';

// Affiliate Video Production — Clip Jobs / UGC Studio v2
// subjectType: product = สินค้าจาก catalog | place = ร้าน/สถานที่ (รวมโรงแรม) | food = อาหาร/เมนู
//              software = ซอฟต์แวร์/ฟีเจอร์ SaaS (v2.1 — เช่น GoSell; ฉาก screen ใช้ใบสั่ง Capture)
// mode (v1) ยังรับได้ — v2 ใช้ sceneType ต่อ shot เป็นหลัก (Resource Rail เลือก char+hand พร้อมกันได้)

export const CLIP_SUBJECT_TYPES = ['product', 'place', 'food', 'software'] as const;
export const CLIP_MODES = ['hand', 'presenter'] as const;
export const CLIP_OUTPUT_TYPES = ['video', 'stills'] as const;
export const CLIP_JOB_STATUSES = [
  'draft',
  'planning',
  'generating',
  'review',
  'ready',
  'published',
  'archived',
] as const;
export const CLIP_SHOT_SECTIONS = [
  'hook',
  'reveal',
  'interaction',
  'demonstration',
  'result',
  'cta',
] as const;
export const CLIP_SHOT_STATUSES = ['pending', 'generated', 'approved'] as const;
// screen = ภาพ capture หน้าจอจริง (เฉพาะ job software — service ตรวจ 400 ถ้าใช้กับ job อื่น)
export const CLIP_SCENE_TYPES = ['presenter', 'hands', 'product_only', 'screen'] as const;
export const CLIP_VOICE_TYPES = ['on_camera', 'female_vo'] as const;

// brief ของ place/food/software (subjectType != product) — name บังคับ, place บังคับ category ตาม recipe keys
export class SubjectBriefDto {
  @IsOptional() @IsString() name?: string; // place/food = ชื่อร้าน/เมนู | software = ชื่อฟีเจอร์
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) highlights?: string[];
  @IsOptional() @IsString() vibe?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() mapUrl?: string;
  @IsOptional() @IsString() openHours?: string;
  @IsOptional() @IsString() priceRange?: string;
  @IsOptional() @IsString() note?: string;
  // v2.1 — เฉพาะ software (additive; ประเภทอื่นไม่ใช้)
  @IsOptional() @IsString() product?: string; // ระบบ เช่น "GoSell"
  @IsOptional() @IsString() painPoint?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) steps?: string[]; // ขั้นตอนใช้งาน 3-5 ขั้น → ฉาก screen ต้อง map ตามนี้
  @IsOptional() @IsString() resultMetric?: string; // เช่น "แพ็คออเดอร์เร็วขึ้น 3 เท่า"
  @IsOptional() @IsString() pricing?: string;
  @IsOptional() @IsString() signupUrl?: string; // ลิงก์สมัคร (package ใช้ก่อน affiliateLink)
  // job สินค้า (subjectType=product) — "โจทย์ของคลิปนี้" ระดับ job (ข้อมูลถาวรอยู่ที่
  // Product.reviewBrief): angle = มุมที่อยากตี, promo = โปร/ดีลช่วงนี้, note = โน้ตถึง AI
  @IsOptional() @IsString() angle?: string;
  @IsOptional() @IsString() promo?: string;
  // reviews = เสียงรีวิวจริงของลูกค้า 4-5 ดาวที่ผู้ใช้ติ๊กเลือก (service cap 5 ข้อ ข้อละ 300 ตัวอักษร)
  // → เข้า prompt เป็น "เสียงลูกค้าจริง" ให้ AI paraphrase ทำ hook/บทพูด
  @IsOptional() @IsArray() @IsString({ each: true }) reviews?: string[];
}

export class CreateClipJobDto {
  @IsOptional() @IsIn(CLIP_SUBJECT_TYPES) subjectType?: string;
  @IsOptional() @IsUUID() productId?: string; // บังคับเมื่อ subjectType = product
  @IsOptional() @ValidateNested() @Type(() => SubjectBriefDto) subjectBrief?: SubjectBriefDto;
  @IsOptional() @IsIn(CTA_TYPES) ctaType?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsIn(CLIP_MODES) mode?: string;
  @IsOptional() @IsIn(CLIP_OUTPUT_TYPES) outputType?: string;
  // Resource Rail — default ไม่เลือกทุกช่อง (null = AI จัดให้)
  @IsOptional() @IsUUID() handId?: string;
  @IsOptional() @IsUUID() characterId?: string;
  @IsOptional() @IsUUID() wardrobeId?: string; // ต้องเป็นชุดของ characterId
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUUID() voiceProfileId?: string;
  @IsOptional() @IsString() platform?: string;
  @IsOptional() @IsString() aspectRatio?: string;
  @IsOptional() @IsNumber() @Min(1) targetDurationSec?: number;
  @IsOptional() @IsNumber() @Min(4) sceneLenSec?: number; // ⏱ ความยาวต่อฉาก 4/6/8 วิ
  @IsOptional() @IsString() affiliateLink?: string; // รวมลิงก์จอง/OTA สำหรับ place
}

export class UpdateClipJobDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @ValidateNested() @Type(() => SubjectBriefDto) subjectBrief?: SubjectBriefDto;
  @IsOptional() @IsIn(CTA_TYPES) ctaType?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsIn(CLIP_OUTPUT_TYPES) outputType?: string;
  @IsOptional() @IsUUID() handId?: string;
  @IsOptional() @IsUUID() characterId?: string;
  @IsOptional() @IsUUID() wardrobeId?: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUUID() voiceProfileId?: string;
  @IsOptional() @IsString() voiceSpec?: string;
  @IsOptional() @IsString() headline?: string;
  @IsOptional() @IsString() platform?: string;
  @IsOptional() @IsString() aspectRatio?: string;
  @IsOptional() @IsNumber() @Min(1) targetDurationSec?: number;
  @IsOptional() @IsNumber() @Min(4) sceneLenSec?: number; // ⏱ ความยาวต่อฉาก 4/6/8 วิ
  @IsOptional() @IsString() script?: string;
  @IsOptional() @IsString() caption?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) hashtags?: string[];
  @IsOptional() @IsString() affiliateLink?: string;
  @IsOptional() @IsString() finalVideoUrl?: string; // ลิงก์ Google Drive คลิปตัวเต็ม
  @IsOptional() @IsString() finalNote?: string;
  // manual override — สถานะไหลอัตโนมัติจาก shot ก็ได้ (generating/ready) แต่คนสั่ง published เองได้
  @IsOptional() @IsIn(CLIP_JOB_STATUSES) status?: string;
}

export class ListClipJobsQuery {
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsIn(CLIP_SUBJECT_TYPES) subjectType?: string;
  @IsOptional() @IsIn(CLIP_MODES) mode?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}

// วางแผน v2 — ต้องเลือกคอนเซปต์จากชุดล่าสุดก่อน (POST :id/concepts)
export class PlanClipJobDto {
  @IsInt() @Min(0) conceptIndex!: number;
}

export class ClipShotInputDto {
  @IsIn(CLIP_SHOT_SECTIONS) section!: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsIn(CLIP_SCENE_TYPES) sceneType?: string;
  @IsOptional() @IsBoolean() showProduct?: boolean;
  @IsOptional() @IsIn(CLIP_VOICE_TYPES) voiceType?: string;
  @IsOptional() @IsString() onScreenText?: string;
  @IsOptional() @IsUUID() gestureId?: string;
  @IsOptional() @IsUUID() handId?: string;
  @IsOptional() @IsUUID() cameraId?: string;
  @IsOptional() @IsUUID() lightingId?: string;
  @IsOptional() @IsNumber() @Min(0) durationSec?: number;
  @IsOptional() @IsString() dialogue?: string;
  @IsOptional() @IsString() stillPrompt?: string;
  @IsOptional() @IsString() motionPrompt?: string;
  @IsOptional() @IsString() negativePrompt?: string;
  @IsOptional() @IsUUID() stillAssetId?: string;
  @IsOptional() @IsString() videoUrl?: string;
  @IsOptional() @IsIn(CLIP_SHOT_STATUSES) status?: string;
  @IsOptional() @IsString() note?: string;
}

export class ReplaceClipShotsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClipShotInputDto)
  shots!: ClipShotInputDto[];
}

export class PatchClipShotDto {
  @IsOptional() @IsIn(CLIP_SHOT_STATUSES) status?: string;
  @IsOptional() @IsIn(CLIP_SCENE_TYPES) sceneType?: string;
  @IsOptional() @IsBoolean() showProduct?: boolean;
  @IsOptional() @IsIn(CLIP_VOICE_TYPES) voiceType?: string;
  @IsOptional() @IsString() onScreenText?: string;
  @IsOptional() @IsUUID() stillAssetId?: string;
  @IsOptional() @IsString() videoUrl?: string;
  @IsOptional() @IsString() dialogue?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() stillPrompt?: string;
  @IsOptional() @IsString() motionPrompt?: string;
  @IsOptional() @IsString() negativePrompt?: string;
  @IsOptional() @IsNumber() @Min(0) durationSec?: number;
}
