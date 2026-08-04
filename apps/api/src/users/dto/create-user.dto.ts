import { ArrayNotEmpty, IsArray, IsEmail, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(8, { message: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' })
  password!: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'ต้องเลือกอย่างน้อย 1 บทบาท' })
  @IsString({ each: true })
  roleKeys!: string[];
}
