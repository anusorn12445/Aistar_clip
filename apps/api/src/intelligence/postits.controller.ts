import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PostitStatus, TaskPriority } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { PostitsService } from './postits.service';
import { CreatePostitCommentDto, CreatePostitDto, UpdatePostitDto } from './dto/postit.dto';

@Controller('postits')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PostitsController {
  constructor(private postits: PostitsService) {}

  @Get()
  @RequirePermission('postit', 'V')
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('status') status?: PostitStatus,
    @Query('assigneeId') assigneeId?: string,
    @Query('createdBy') createdBy?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('priority') priority?: TaskPriority,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.postits.list(
      {
        q,
        type,
        status,
        assigneeId,
        createdBy,
        entityType,
        entityId,
        priority,
        sortBy,
        sortDir,
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
      user,
    );
  }

  @Get(':id')
  @RequirePermission('postit', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.postits.get(id);
  }

  @Post()
  @RequirePermission('postit', 'C')
  create(@Body() dto: CreatePostitDto, @CurrentUser() user: AuthUser) {
    return this.postits.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('postit', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePostitDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.postits.update(id, dto, user);
  }

  @Post(':id/comments')
  @RequirePermission('postit', 'C')
  addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePostitCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.postits.addComment(id, dto, user);
  }

  @Post(':id/convert-to-task')
  @RequirePermission('postit', 'C')
  convertToTask(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.postits.convertToTask(id, user);
  }
}
