import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { PromptsService } from './prompts.service';
import { CreatePlatformDto } from './dto/create-platform.dto';

@Controller('platforms')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlatformsController {
  constructor(private prompts: PromptsService) {}

  @Get()
  @RequirePermission('prompt', 'V')
  list() {
    return this.prompts.listPlatforms();
  }

  // เพิ่ม platform ใหม่ = งาน admin/prompt engineer (D4 "อนาคตมีอะไรใหม่ก็จะใช้")
  @Post()
  @RequirePermission('prompt', 'A')
  create(@Body() dto: CreatePlatformDto, @CurrentUser() user: AuthUser) {
    return this.prompts.createPlatform(dto, user);
  }
}
