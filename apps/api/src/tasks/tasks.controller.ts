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
import { TaskPriority, TaskStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

@Controller('tasks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TasksController {
  constructor(private tasks: TasksService) {}

  @Get()
  @RequirePermission('task', 'V')
  list(
    @CurrentUser() user: AuthUser,
    @Query('assigneeId') assigneeId?: string,
    @Query('createdBy') createdBy?: string,
    @Query('status') status?: TaskStatus,
    @Query('priority') priority?: TaskPriority,
    @Query('createdFrom') createdFrom?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('dueBefore') dueBefore?: string,
    @Query('dueAfter') dueAfter?: string,
    @Query('q') q?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.tasks.list(
      {
        assigneeId,
        createdBy,
        status,
        priority,
        createdFrom,
        entityType,
        entityId,
        dueBefore,
        dueAfter,
        q,
        sortBy,
        sortDir,
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
      user,
    );
  }

  // รายชื่อ user ที่มอบหมายงานได้ — ใช้สิทธิ์ task ไม่ใช่ user (ทุก role ที่สร้าง task ได้ต้องเห็น)
  @Get('assignees')
  @RequirePermission('task', 'V')
  assignees() {
    return this.tasks.listAssignees();
  }

  // รายละเอียดเต็มสำหรับ card modal — task + comments + attachmentCount
  @Get(':id')
  @RequirePermission('task', 'V')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.detail(id);
  }

  @Post()
  @RequirePermission('task', 'C')
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: AuthUser) {
    return this.tasks.create(dto, user);
  }

  @Post(':id/comments')
  @RequirePermission('task', 'C')
  addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasks.addComment(id, dto, user);
  }

  // ลบได้เฉพาะ comment ของตัวเอง (admin ลบได้ทุกอัน) — เช็คใน service
  @Delete(':id/comments/:commentId')
  @RequirePermission('task', 'C')
  deleteComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasks.deleteComment(id, commentId, user);
  }

  @Patch(':id')
  @RequirePermission('task', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasks.update(id, dto, user);
  }
}
