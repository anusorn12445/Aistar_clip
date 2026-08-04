import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

export class SettingItemDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  // ค่าว่าง = ล้าง override ใน DB (กลับไปใช้ .env) — จึงอนุญาต empty string
  @IsString()
  value!: string;
}

export class UpdateSettingsDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'ไม่มีรายการตั้งค่าให้บันทึก' })
  @ValidateNested({ each: true })
  @Type(() => SettingItemDto)
  items!: SettingItemDto[];
}
