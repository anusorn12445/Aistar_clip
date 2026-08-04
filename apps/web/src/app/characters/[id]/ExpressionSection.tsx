"use client";

import MediaCardSection from "./MediaCardSection";
import { buildExpressionPrompt } from "./imagePrompt";
import type { SheetPromptContext } from "./WardrobeSection";
import { Smile } from "lucide-react";

export default function ExpressionSection({
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
          <Smile className="size-5" /> คลังสีหน้า (Expression)
        </span>
      }
      segment="expressions"
      entityType="character_expression"
      assetType="expression"
      hasOccasion={false}
      namePlaceholder='ชื่ออารมณ์/สีหน้า เช่น "ยิ้มหวาน", "โกรธ", "เขิน"'
      addLabel="+ เพิ่มสีหน้า"
      emptyText="ยังไม่มีสีหน้าในคลัง — เพิ่มอารมณ์แรกแล้วอัปโหลดรูปได้เลย"
      buildPrompt={
        promptContext
          ? (tool, item) =>
              buildExpressionPrompt(tool, promptContext.character, promptContext.blueprint, item, {
                hasReference: promptContext.hasReference,
              })
          : undefined
      }
    />
  );
}
