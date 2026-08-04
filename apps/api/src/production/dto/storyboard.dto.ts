import { IsBoolean, IsOptional } from 'class-validator';

// Storyboard (Content Intelligence ระบบ 3) — ร่าง image prompt ต่อช็อตทั้งอีพี
export class GenerateStoryboardPromptsDto {
  // regenerate=true → เขียนทับ imagePrompt เดิม (ปกติ skip ช็อตที่มี prompt แล้ว)
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;
}
