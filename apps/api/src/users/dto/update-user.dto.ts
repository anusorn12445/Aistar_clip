import { UserStatus } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  email?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'ต้องเลือกอย่างน้อย 1 บทบาท' })
  @IsString({ each: true })
  roleKeys?: string[];

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร' })
  newPassword?: string;
}
