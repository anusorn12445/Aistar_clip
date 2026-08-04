import { IsString, Matches } from 'class-validator';

// Platform registry ตาม D4 — admin/prompt engineer เพิ่ม platform ใหม่ได้เอง
export class CreatePlatformDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]*$/, {
    message: 'key ต้องเป็นตัวพิมพ์เล็ก a-z, 0-9, _ หรือ - เท่านั้น',
  })
  key!: string;

  @IsString()
  name!: string;
}
