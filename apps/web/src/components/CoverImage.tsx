"use client";

// CoverImage — บล็อกรูปปกมุมโค้งสำหรับการ์ด
// มีรูป → photo เต็มบล็อก / ไม่มีรูป → gradient ประจำชื่อ + อักษรตัวใหญ่ + emoji watermark ตามชนิด
// children = overlay (เช่น gradient ชื่อด้านล่าง, chip status)

import {
  type LucideIcon,
  Drama,
  ShoppingBag,
  Clapperboard,
  Target,
  Calendar,
  Image as ImageIcon,
} from "lucide-react";
import { gradientFor, initialOf, useAssetImage, useEntityThumb } from "@/lib/media";

const TYPE_ICON: Record<string, LucideIcon> = {
  character: Drama,
  product: ShoppingBag,
  episode: Clapperboard,
  campaign: Target,
  content: Calendar,
};

export default function CoverImage({
  assetId,
  entityType,
  entityId,
  name,
  className = "",
  aspect = "aspect-square",
  children,
}: {
  /** ถ้ารู้ assetId อยู่แล้ว ส่งมาเลย — ไม่ต้อง resolve ผ่าน thumbnails endpoint */
  assetId?: string | null;
  entityType?: string;
  entityId?: string;
  name: string;
  className?: string;
  aspect?: string; // เช่น "aspect-[3/4]", "aspect-square", "aspect-video"
  children?: React.ReactNode;
}) {
  const resolved = useEntityThumb(entityType ?? "", assetId ? null : (entityId ?? null));
  const finalAssetId = assetId ?? resolved;
  const url = useAssetImage(finalAssetId);
  const WatermarkIcon = TYPE_ICON[entityType ?? ""] ?? ImageIcon;

  return (
    <div
      className={`relative overflow-hidden ${aspect} ${className}`}
      style={url ? undefined : { background: gradientFor(name) }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <>
          <span className="absolute inset-0 flex select-none items-center justify-center text-5xl font-bold text-white/70">
            {initialOf(name)}
          </span>
          <WatermarkIcon className="absolute bottom-2 right-2 size-7 select-none text-white opacity-40" />
        </>
      )}
      {children}
    </div>
  );
}
