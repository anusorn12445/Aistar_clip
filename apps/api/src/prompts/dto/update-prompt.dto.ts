import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdatePromptDto {
  @IsOptional()
  @IsString()
  name?: string;

  // toggle ต้องมีสิทธิ์ A — เช็คใน service
  @IsOptional()
  @IsBoolean()
  bestFlag?: boolean;
}
