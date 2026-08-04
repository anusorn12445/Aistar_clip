import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { PromptHubService } from './prompt-hub.service';
import { HUB_SOURCE_TYPES, HubSnapshotDto, type HubSourceType } from './dto/hub-snapshot.dto';

// Prompt Hub (🌐 ทุกแหล่ง) — live reference จาก 6 คลัง + snapshot เข้าคลังหลัก
// ต้องลงทะเบียนก่อน PromptsController ใน module — กัน /prompts/hub ชนกับ GET /prompts/:id
@Controller('prompts/hub')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PromptHubController {
  constructor(private hub: PromptHubService) {}

  @Get()
  @RequirePermission('prompt', 'V')
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('sourceType') sourceType?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (sourceType && !(HUB_SOURCE_TYPES as readonly string[]).includes(sourceType)) {
      throw new BadRequestException(
        `sourceType ต้องเป็นหนึ่งใน: ${HUB_SOURCE_TYPES.join(', ')}`,
      );
    }
    return this.hub.list(
      {
        q: q?.trim() || undefined,
        sourceType: sourceType as HubSourceType | undefined,
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
      user,
    );
  }

  @Post('snapshot')
  @RequirePermission('prompt', 'C')
  snapshot(@Body() dto: HubSnapshotDto, @CurrentUser() user: AuthUser) {
    return this.hub.snapshot(dto.sourceType, dto.sourceId, user);
  }
}
