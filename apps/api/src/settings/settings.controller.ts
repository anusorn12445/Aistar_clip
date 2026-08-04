import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

// System Settings — จัดการ credential ของ integration ต่าง ๆ ผ่าน UI (module 'setting' = admin เท่านั้น)
@Controller('settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get()
  @RequirePermission('setting', 'V')
  list() {
    return this.settings.list();
  }

  @Put()
  @RequirePermission('setting', 'C')
  update(@Body() dto: UpdateSettingsDto, @CurrentUser() user: AuthUser) {
    return this.settings.setMany(dto.items, user.id);
  }
}
