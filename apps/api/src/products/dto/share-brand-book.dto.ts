import { IsBoolean, IsOptional } from 'class-validator';

// POST /brands/:id/share — body ว่างได้ (idempotent), rotate=true = สร้าง token ใหม่
export class ShareBrandBookDto {
  @IsOptional()
  @IsBoolean()
  rotate?: boolean;
}
