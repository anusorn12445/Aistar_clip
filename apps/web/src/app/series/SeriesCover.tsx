"use client";

import { useEffect, useState } from "react";
import { fetchAssetObjectUrl } from "@/lib/assets";
import { coverGradient } from "@/lib/series";

// ปกซีรีส์ — โหลดรูปจาก asset (ต้องแนบ token เลย fetch เป็น object URL) หรือ gradient placeholder
export default function SeriesCover({
  coverAssetId,
  name,
  className,
}: {
  coverAssetId: string | null;
  name: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    if (coverAssetId) {
      fetchAssetObjectUrl(coverAssetId)
        .then((u) => {
          if (cancelled) {
            URL.revokeObjectURL(u);
            return;
          }
          objectUrl = u;
          setUrl(u);
        })
        .catch(() => setUrl(null));
    } else {
      setUrl(null);
    }
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [coverAssetId]);

  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className={`object-cover ${className ?? ""}`} />;
  }
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br ${coverGradient(name)} ${className ?? ""}`}
    >
      <span className="px-3 text-center text-2xl font-bold text-white/80 drop-shadow">
        {name || "ซีรีส์"}
      </span>
    </div>
  );
}
