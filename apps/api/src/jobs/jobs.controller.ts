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
import { JobStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { JobsService } from './jobs.service';
import {
  ChangeJobStatusDto,
  CreateDeliverableDto,
  CreateJobDto,
  UpdateDeliverableDto,
  UpdateJobDto,
} from './dto/job.dto';

@Controller('jobs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class JobsController {
  constructor(private jobs: JobsService) {}

  @Get()
  @RequirePermission('job', 'V')
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: JobStatus,
    @Query('type') type?: string,
    @Query('clientId') clientId?: string,
    @Query('priority') priority?: string,
    @Query('ownerId') ownerId?: string,
    @Query('dueBefore') dueBefore?: string,
    @Query('dueAfter') dueAfter?: string,
    @Query('archived') archived?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.jobs.list(
      {
        q,
        status,
        type,
        clientId,
        priority,
        ownerId,
        dueBefore,
        dueAfter,
        archived,
        sortBy,
        sortDir,
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
      user,
    );
  }

  @Get(':id')
  @RequirePermission('job', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.get(id);
  }

  @Post()
  @RequirePermission('job', 'C')
  create(@Body() dto: CreateJobDto, @CurrentUser() user: AuthUser) {
    return this.jobs.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('job', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.jobs.update(id, dto, user);
  }

  @Patch(':id/status')
  @RequirePermission('job', 'C')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeJobStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.jobs.changeStatus(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('job', 'C')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.jobs.archive(id, user);
  }

  @Patch(':id/unarchive')
  @RequirePermission('job', 'C')
  unarchive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.jobs.unarchive(id, user);
  }

  // ── Deliverables ───────────────────────────────────────────

  @Post(':id/deliverables')
  @RequirePermission('job', 'C')
  addDeliverable(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDeliverableDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.jobs.addDeliverable(id, dto, user);
  }

  @Patch(':id/deliverables/:did')
  @RequirePermission('job', 'C')
  updateDeliverable(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('did', ParseUUIDPipe) did: string,
    @Body() dto: UpdateDeliverableDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.jobs.updateDeliverable(id, did, dto, user);
  }

  @Delete(':id/deliverables/:did')
  @RequirePermission('job', 'C')
  deleteDeliverable(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('did', ParseUUIDPipe) did: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.jobs.deleteDeliverable(id, did, user);
  }
}
