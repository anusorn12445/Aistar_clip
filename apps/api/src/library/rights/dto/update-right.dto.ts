import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateRightDto } from './create-right.dto';

// เปลี่ยน entity ที่ผูกไม่ได้ — สร้างใหม่แทน / legalStatus เปลี่ยนผ่าน endpoint /status เท่านั้น
export class UpdateRightDto extends PartialType(
  OmitType(CreateRightDto, ['entityType', 'entityId'] as const),
) {}
