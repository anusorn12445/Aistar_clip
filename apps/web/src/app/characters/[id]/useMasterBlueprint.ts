"use client";

// blueprint ประกอบ Master Prompt ของตัวละคร — logic เดียวกับใน ImagePromptViewer:
// ใช้ blueprintId ของตัวละครถ้ายัง active, ไม่งั้น fallback default blueprint ที่ active

import { useEffect, useState } from "react";
import {
  fetchCharacterBlueprint,
  fetchCharacterBlueprints,
  type CharacterBlueprint,
} from "@/lib/api";

export function useMasterBlueprint(blueprintId?: string | null): CharacterBlueprint | null {
  const [blueprint, setBlueprint] = useState<CharacterBlueprint | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (blueprintId) {
        try {
          const bp = await fetchCharacterBlueprint(blueprintId);
          if (bp.status === "active") {
            if (!cancelled) setBlueprint(bp);
            return;
          }
        } catch {
          // archived/หาย/API เก่า — ตกไปใช้ default ด้านล่าง
        }
      }
      try {
        const list = await fetchCharacterBlueprints({ status: "active" });
        if (!cancelled) setBlueprint(list.find((b) => b.isDefault) ?? null);
      } catch {
        if (!cancelled) setBlueprint(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blueprintId]);

  return blueprint;
}
