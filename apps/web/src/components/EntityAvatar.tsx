"use client";

// EntityAvatar — avatar วงกลมแบบ "รูปจริงก่อน gradient ทีหลัง"
// มีรูป (primary_reference / cover ของ entity) → โชว์รูป
// ไม่มีรูป → gradient ประจำชื่อ + อักษรตัวแรก

import { gradientFor, initialOf, useAssetImage, useEntityThumb } from "@/lib/media";

const SIZES: Record<string, string> = {
  xs: "h-4 w-4 text-[8px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-14 w-14 text-lg",
};

export default function EntityAvatar({
  entityType,
  id,
  name,
  size = "md",
  assetId,
  className = "",
  title,
}: {
  entityType: string; // character, product, episode, ...
  id: string;
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  /** ถ้ารู้ assetId อยู่แล้ว (เช่นจาก list response) ส่งมาเลย จะข้ามการ resolve */
  assetId?: string | null;
  className?: string;
  title?: string;
}) {
  // ถ้ามี assetId ส่งมาแล้ว ไม่ต้องยิง thumbnails endpoint
  const resolved = useEntityThumb(entityType, assetId ? null : id);
  const finalAssetId = assetId ?? resolved;
  const url = useAssetImage(finalAssetId);

  return (
    <span
      title={title ?? name}
      className={`relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full ${SIZES[size] ?? SIZES.md} ${className}`}
      style={url ? undefined : { background: gradientFor(name) }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="font-semibold leading-none text-white/90">{initialOf(name)}</span>
      )}
    </span>
  );
}
