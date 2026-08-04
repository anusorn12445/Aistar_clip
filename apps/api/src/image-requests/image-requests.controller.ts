import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { ImageRequestsService } from './image-requests.service';
import { DraftPromptService } from './draft-prompt.service';
import {
  ChangeImageRequestStatusDto,
  CreateImageRequestDto,
  UpdateImageRequestDto,
} from './dto/image-request.dto';

// งานภาพ (Image Request) — mini-ticket ผลิต banner/cover/illustration
// permission matrix ใช้ C = Create/Edit ตามธรรมเนียม module อื่น (jobs/tasks)
// การอนุมัติ (review → approved) เช็คเพิ่มใน service: ผู้ขอ หรือ role ที่ถือ A
@Controller('image-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ImageRequestsController {
  constructor(
    private requests: ImageRequestsService,
    private draft: DraftPromptService,
  ) {}

  @Get()
  @RequirePermission('image_request', 'V')
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('requesterId') requesterId?: string,
    @Query('imageType') imageType?: string,
    @Query('priority') priority?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.requests.list(
      {
        q,
        status,
        assigneeId,
        requesterId,
        imageType,
        priority,
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
      user,
    );
  }

  @Get(':id')
  @RequirePermission('image_request', 'V')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.requests.get(id, user);
  }

  @Post()
  @RequirePermission('image_request', 'C')
  create(@Body() dto: CreateImageRequestDto, @CurrentUser() user: AuthUser) {
    return this.requests.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('image_request', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateImageRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.requests.update(id, dto, user);
  }

  @Post(':id/status')
  @RequirePermission('image_request', 'C')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeImageRequestStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.requests.changeStatus(id, dto, user);
  }

  // ✨ ร่าง image-gen prompt จากบรีฟ + Brand Book (deterministic + AI เกลาเมื่อตั้งค่าไว้)
  @Post(':id/draft-prompt')
  @RequirePermission('image_request', 'C')
  draftPrompt(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.draft.draftPrompt(id, user);
  }

  // DELETE = ยกเลิก (soft) — ไม่มี hard delete
  @Delete(':id')
  @RequirePermission('image_request', 'C')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.requests.cancel(id, user);
  }
}
