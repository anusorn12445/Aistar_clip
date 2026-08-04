import { IsIn, IsString, IsUUID } from 'class-validator';

// linkRole ที่ระบบรู้จัก — export ให้ DTO อื่น (create-asset, import-asset-url) ใช้ชุดเดียวกัน
export const ASSET_LINK_ROLES = [
  'reference',
  'primary_reference',
  // รูป Reference ประจำ prompt (ล็อกหน้า) — แนบคู่ Master Prompt ตอน gen รูปค่ายนอก
  // (ตัวละครละ 1 รูป — service demote ตัวเดิมให้อัตโนมัติเหมือน primary_reference)
  'prompt_reference',
  'deliverable',
  'thumbnail',
  'cover',
  // Brand Book (entityType 'brand'): โลโก้ตาม version / เทมเพลต / มู้ดภาพ
  'logo_icon',
  'logo_full',
  'logo_mono',
  'template',
  'mood',
  // Character Sheet — Turnaround 5 มุม (entityType 'character', มุมละ 1 รูป —
  // service demote ตัวเดิมเป็น reference อัตโนมัติเหมือน prompt_reference)
  'turnaround_sheet',
  'turnaround_front',
  'turnaround_side',
  'turnaround_three_quarter',
  'turnaround_back',
  'turnaround_full_body',
  // รูปมาตรฐานประจำรายการ (entityType character_expression/character_wardrobe/character_pose
  // — รายการละ 1 รูป, demote เหมือนกัน)
  'standard_image',
  // คลังรูปรีวิวของสินค้า (Product Review Brief) — หลายรูปต่อสินค้า, ไม่แตะ role 'cover'
  'review_image',
] as const;

export class CreateAssetLinkDto {
  @IsString()
  entityType!: string; // character, episode, shot, campaign

  @IsUUID()
  entityId!: string;

  @IsIn(ASSET_LINK_ROLES)
  linkRole!: string;
}
