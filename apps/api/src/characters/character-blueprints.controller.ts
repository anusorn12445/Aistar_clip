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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { CharacterBlueprintsService } from './character-blueprints.service';
import {
  CreateCharacterBlueprintDto,
  ReorderCharacterBlueprintsDto,
  UpdateCharacterBlueprintDto,
} from './dto/character-blueprint.dto';

// Character Blueprint (พิมพ์เขียว) — CRUD จัดการที่ Settings
// GET (list/read): character V — ให้คนที่สร้าง character อ่าน active list มาเลือกได้ (mirror category read)
// mutate (create/update/archive/reorder): setting C — จัดการที่ Settings เท่านั้น
@Controller('character-blueprints')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CharacterBlueprintsController {
  constructor(private blueprints: CharacterBlueprintsService) {}

  @Get()
  @RequirePermission('character', 'V')
  list(@Query('status') status?: string, @Query('q') q?: string) {
    return this.blueprints.list({ status, q });
  }

  @Get(':id')
  @RequirePermission('character', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.blueprints.get(id);
  }

  @Post()
  @RequirePermission('setting', 'C')
  create(@Body() dto: CreateCharacterBlueprintDto, @CurrentUser() user: AuthUser) {
    return this.blueprints.create(dto, user);
  }

  @Post('reorder')
  @RequirePermission('setting', 'C')
  reorder(@Body() dto: ReorderCharacterBlueprintsDto, @CurrentUser() user: AuthUser) {
    return this.blueprints.reorder(dto, user);
  }

  @Patch(':id')
  @RequirePermission('setting', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCharacterBlueprintDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.blueprints.update(id, dto, user);
  }

  @Post(':id/archive')
  @RequirePermission('setting', 'C')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.blueprints.archive(id, user);
  }
}
