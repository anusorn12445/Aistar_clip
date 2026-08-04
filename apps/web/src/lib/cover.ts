// cover.ts — helper กลางสำหรับ "เปลี่ยนภาพปก" ของ entity ใด ๆ ในระบบ (polymorphic asset)
//
// ระบบปกใช้ AssetLink (entityType + entityId + linkRole). การ์ด/hero เลือกรูปผ่าน
// GET /assets/thumbnails ที่จัดลำดับ primary_reference > cover > thumbnail > อื่น ๆ
// (tie-break: createdAt เก่าสุด). ดังนั้นการ "ตั้งปก" = ทำให้รูปเป้าหมายมี link role
// ที่ชนะรูปอื่น แล้ว demote ปกเดิม
//
// - role = 'cover' (ค่า default): server ไม่มี demotion logic — จัดการฝั่ง client
//   (ถอด cover ของรูปอื่นเป็น reference) แล้วตั้งรูปใหม่เป็น cover
// - role = 'primary_reference' (portrait ตัวละคร): server auto-demote ปกเดิมให้เอง
//   ตอน POST link ใหม่ (assets.service addLink) — แค่ POST link ใหม่ก็พอ

import { api } from "@/lib/api";
import { primeEntityThumb } from "@/lib/media";
import type { Asset } from "@/lib/assets";

/**
 * ตั้ง `target` เป็นปก (role) ของ entity แล้ว demote ปกเดิม
 * - demote รูปอื่นที่ถือ role นี้อยู่ → ลบ link แล้วถ้าไม่เหลือ link กับ entity นี้เลย
 *   ให้เพิ่ม reference link กลับไป (รูปจะได้ยังอยู่ใน gallery)
 * - เพิ่ม role link ให้ target ถ้ายังไม่มี
 * - prime local thumb cache ให้ UI เห็นรูปใหม่ทันทีโดยไม่ต้อง refetch
 *
 * สำหรับ role = 'primary_reference' server จะ demote ตัวเดิมให้เองตอน POST
 * แต่โค้ดนี้ทำงานถูกต้องกับทั้งสอง role (idempotent + demote ครบ)
 */
export async function promoteCover(
  entityType: string,
  entityId: string,
  target: Asset,
  assets: Asset[],
  role = "cover",
): Promise<void> {
  const roleLinkFor = (a: Asset) =>
    a.links.find(
      (l) => l.entityType === entityType && l.entityId === entityId && l.linkRole === role,
    );

  // demote ปกเดิมของรูปอื่น
  for (const a of assets) {
    if (a.id === target.id) continue;
    const link = roleLinkFor(a);
    if (!link) continue;
    await api(`/assets/${a.id}/links/${link.id}`, { method: "DELETE" });
    const hasOtherLink = a.links.some(
      (l) => l.id !== link.id && l.entityType === entityType && l.entityId === entityId,
    );
    if (!hasOtherLink) {
      await api(`/assets/${a.id}/links`, {
        method: "POST",
        body: JSON.stringify({ entityType, entityId, linkRole: "reference" }),
      });
    }
  }

  // ตั้งรูปใหม่เป็นปก (ถ้ายังไม่ได้เป็น)
  if (!roleLinkFor(target)) {
    await api(`/assets/${target.id}/links`, {
      method: "POST",
      body: JSON.stringify({ entityType, entityId, linkRole: role }),
    });
  }

  primeEntityThumb(entityType, entityId, target.id);
}

/** เช็คว่ารูปนี้เป็นปก (role) ของ entity อยู่หรือไม่ */
export function isCoverAsset(
  asset: Asset,
  entityType: string,
  entityId: string,
  role = "cover",
): boolean {
  return asset.links.some(
    (l) => l.entityType === entityType && l.entityId === entityId && l.linkRole === role,
  );
}
