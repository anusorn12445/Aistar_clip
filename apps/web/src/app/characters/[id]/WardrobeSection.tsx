"use client";

import MediaCardSection from "./MediaCardSection";
import {
  buildWardrobePrompt,
  type MasterPromptBlueprint,
  type PromptCharacter,
} from "./imagePrompt";
import { Shirt } from "lucide-react";

// context สำหรับ prompt ประจำรายการ (Character Sheet) — ไม่ส่ง = ไม่มีปุ่มก๊อป prompt
export interface SheetPromptContext {
  character: PromptCharacter;
  blueprint: MasterPromptBlueprint | null;
  hasReference: boolean;
}

export default function WardrobeSection({
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
          <Shirt className="size-5" /> ตู้เสื้อผ้า (Wardrobe)
        </span>
      }
      segment="wardrobe"
      entityType="character_wardrobe"
      assetType="outfit"
      hasOccasion
      namePlaceholder='ชื่อชุด เช่น "ชุดออฟฟิศ", "ชุดไลฟ์สด"'
      addLabel="+ เพิ่มชุด"
      emptyText="ยังไม่มีชุดในตู้เสื้อผ้า — เพิ่มชุดแรกแล้วอัปโหลดรูปได้เลย"
      buildPrompt={
        promptContext
          ? (tool, item) =>
              buildWardrobePrompt(tool, promptContext.character, promptContext.blueprint, item, {
                hasReference: promptContext.hasReference,
              })
          : undefined
      }
    />
  );
}
