import { IsIn } from 'class-validator';
import { VIEW_SCOPES, ViewScope } from '../../auth/scope.service';

// แก้ role_permission ราย role×module — ตอนนี้เปิดให้ปรับเฉพาะ viewScope
// (actions ยังจัดการผ่าน seed/migration — เพิ่ม field ที่นี่ได้ภายหลังแบบ additive)
export class UpdateRolePermissionDto {
  @IsIn(VIEW_SCOPES)
  viewScope!: ViewScope;
}
