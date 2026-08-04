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
import { ApprovalStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { PromptsService } from './prompts.service';
import { CreatePromptDto } from './dto/create-prompt.dto';
import { CreatePromptVersionDto } from './dto/create-prompt-version.dto';
import { UpdatePromptDto } from './dto/update-prompt.dto';
import { CreatePromptLinkDto } from './dto/create-prompt-link.dto';
import { PromptRelationDto } from './dto/prompt-relation.dto';

class ChangeStatusDto {
  @IsEnum(ApprovalStatus)
  status!: ApprovalStatus;
}

@Controller('prompts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PromptsController {
  constructor(private prompts: PromptsService) {}

  @Get()
  @RequirePermission('prompt', 'V')
  list(
    @Query('q') q?: string,
    @Query('promptType') promptType?: string,
    @Query('targetPlatform') targetPlatform?: string,
    @Query('status') status?: ApprovalStatus,
    @Query('bestFlag') bestFlag?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('page') page?: string,
  ) {
    return this.prompts.list({
      q,
      promptType,
      targetPlatform,
      status,
      bestFlag: bestFlag === undefined ? undefined : bestFlag === 'true' || bestFlag === '1',
      entityType,
      entityId,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  @Get(':id')
  @RequirePermission('prompt', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.prompts.get(id);
  }

  @Post()
  @RequirePermission('prompt', 'C')
  create(@Body() dto: CreatePromptDto, @CurrentUser() user: AuthUser) {
    return this.prompts.create(dto, user);
  }

  @Post(':id/versions')
  @RequirePermission('prompt', 'C')
  createVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePromptVersionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prompts.createVersion(id, dto, user);
  }

  @Patch(':id')
  @RequirePermission('prompt', 'C') // best_flag เช็คสิทธิ์ A เพิ่มใน service
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromptDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prompts.update(id, dto, user);
  }

  @Patch(':id/status')
  @RequirePermission('prompt', 'V') // สิทธิ์ A เช็คละเอียดใน service ตาม state machine
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prompts.changeStatus(id, dto.status, user);
  }

  @Post(':id/links')
  @RequirePermission('prompt', 'C')
  addLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePromptLinkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prompts.addLink(id, dto, user);
  }

  // ─── Relations (เชื่อม ตัวละคร/สินค้า/ลูกค้า/แบรนด์) — prompt-level UX ──

  @Get(':id/relations')
  @RequirePermission('prompt', 'V')
  listRelations(@Param('id', ParseUUIDPipe) id: string) {
    return this.prompts.listRelations(id);
  }

  @Post(':id/relations')
  @RequirePermission('prompt', 'C')
  addRelation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PromptRelationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prompts.addRelation(id, dto, user);
  }

  @Delete(':id/relations')
  @RequirePermission('prompt', 'C')
  removeRelation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PromptRelationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prompts.removeRelation(id, dto, user);
  }
}
