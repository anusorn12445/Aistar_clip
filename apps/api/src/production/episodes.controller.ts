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
import { EpisodeStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { EpisodesService } from './episodes.service';
import { ShotsService } from './shots.service';
import {
  ChangeEpisodeStatusDto,
  CreateEpisodeDto,
  HandoffDto,
  LinkCharacterDto,
  LinkProductDto,
  UpdateEpisodeDto,
} from './dto/episode.dto';
import { CreateShotDto, ReorderShotsDto } from './dto/shot.dto';

@Controller('episodes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EpisodesController {
  constructor(
    private episodes: EpisodesService,
    private shots: ShotsService,
  ) {}

  @Get()
  @RequirePermission('episode', 'V')
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: EpisodeStatus,
    @Query('seriesId') seriesId?: string,
    @Query('campaignId') campaignId?: string,
    @Query('characterId') characterId?: string,
    @Query('season') season?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page?: string,
  ) {
    return this.episodes.list({
      q,
      status,
      seriesId,
      campaignId,
      characterId,
      season,
      sortBy,
      sortDir,
      page: page ? parseInt(page, 10) : 1,
    }, user);
  }

  @Get(':id')
  @RequirePermission('episode', 'V')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.episodes.get(id, user);
  }

  @Get(':id/versions')
  @RequirePermission('episode', 'V')
  versions(@Param('id', ParseUUIDPipe) id: string) {
    return this.episodes.listScriptVersions(id);
  }

  @Post()
  @RequirePermission('episode', 'C')
  create(@Body() dto: CreateEpisodeDto, @CurrentUser() user: AuthUser) {
    return this.episodes.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('episode', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEpisodeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.episodes.update(id, dto, user);
  }

  @Patch(':id/status')
  @RequirePermission('episode', 'V') // สิทธิ์ A/C เช็คละเอียดใน service ตาม state machine
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeEpisodeStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.episodes.changeStatus(id, dto.status, user);
  }

  // ─── Character / Product links ───────────────────────────────

  @Post(':id/characters')
  @RequirePermission('episode', 'C')
  linkCharacter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkCharacterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.episodes.linkCharacter(id, dto.characterId, user);
  }

  @Delete(':id/characters/:characterId')
  @RequirePermission('episode', 'C')
  unlinkCharacter(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.episodes.unlinkCharacter(id, characterId, user);
  }

  @Post(':id/products')
  @RequirePermission('episode', 'C')
  linkProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkProductDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.episodes.linkProduct(id, dto.productId, user);
  }

  @Delete(':id/products/:productId')
  @RequirePermission('episode', 'C')
  unlinkProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.episodes.unlinkProduct(id, productId, user);
  }

  // ─── Shots (nested) ──────────────────────────────────────────

  @Post(':id/shots')
  @RequirePermission('episode', 'C')
  createShot(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateShotDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.shots.create(id, dto, user);
  }

  @Post(':id/shots/reorder')
  @RequirePermission('episode', 'C')
  reorderShots(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderShotsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.shots.reorder(id, dto.shotIds, user);
  }

  // ─── Production Handoff (§E.2) ───────────────────────────────

  @Post(':id/handoff')
  @RequirePermission('episode', 'C')
  handoff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HandoffDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.episodes.handoff(id, dto, user);
  }
}
