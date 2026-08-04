"use client";

// 🧍 Pose Library (Character Sheet) — ท่าโพสเต็มตัวประจำตัวละคร
// โครงเดียวกับ Wardrobe/Expression: การ์ด + รูปมาตรฐาน + ก๊อป prompt ต่อท่า

import MediaCardSection from "./MediaCardSection";
import { buildPosePrompt } from "./imagePrompt";
import type { SheetPromptContext } from "./WardrobeSection";
import { PersonStanding } from "lucide-react";

export default function PoseSection({
  characterId,
  promptContext,
}: {
  characterId: string;
  promptContext?: SheetPromptContext;
}) {
  return (
    <MediaCardSection
      characterId={characterId}
      title={
        <span className="inline-flex items-center gap-2">
          <PersonStanding className="size-5" /> คลังท่าโพส (Pose Library)
        </span>
      }
      segment="poses"
      entityType="character_pose"
      assetType="pose"
      hasOccasion={false}
      namePlaceholder='ชื่อท่า เช่น "ยืนถือสินค้าระดับอก", "นั่งรีวิวหน้ากล้อง"'
      addLabel="+ เพิ่มท่าโพส"
      emptyText="ยังไม่มีท่าโพสในคลัง — เพิ่มท่าแรกแล้วก๊อป prompt ไป gen ได้เลย"
      buildPrompt={
        promptContext
          ? (tool, item) =>
              buildPosePrompt(tool, promptContext.character, promptContext.blueprint, item, {
                hasReference: promptContext.hasReference,
              })
          : undefined
      }
    />
  );
}
