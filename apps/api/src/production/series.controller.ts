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
import { SeriesService } from './series.service';
import {
  CalendarSuggestDto,
  CreateSeasonDto,
  CreateSeriesDto,
  CreateSeriesEpisodeDto,
  SeasonProductDto,
  SeriesCastDto,
  SeriesLocationDto,
  UpdateSeasonDto,
  UpdateSeriesDto,
} from './dto/series.dto';

@Controller('series')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SeriesController {
  constructor(private series: SeriesService) {}

  @Get()
  @RequirePermission('episode', 'V')
  list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('universe') universe?: string,
    @Query('sortBy') sortBy?: string,
    @Query('page') page?: string,
  ) {
    return this.series.list({ q, status, universe, sortBy, page: page ? parseInt(page, 10) : 1 });
  }

  @Post()
  @RequirePermission('episode', 'C')
  create(@Body() dto: CreateSeriesDto, @CurrentUser() user: AuthUser) {
    return this.series.create(dto, user);
  }

  // ─── Seasons (เส้นทาง /series/seasons/* ประกาศก่อน :id — คนละความลึก แต่กันสับสน) ───

  @Patch('seasons/:seasonId')
  @RequirePermission('episode', 'C')
  updateSeason(
    @Param('seasonId', ParseUUIDPipe) seasonId: string,
    @Body() dto: UpdateSeasonDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.series.updateSeason(seasonId, dto, user);
  }

  @Post('seasons/:seasonId/products')
  @RequirePermission('episode', 'C')
  addSeasonProduct(
    @Param('seasonId', ParseUUIDPipe) seasonId: string,
    @Body() dto: SeasonProductDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.series.addSeasonProduct(seasonId, dto.productId, user);
  }

  @Delete('seasons/:seasonId/products/:productId')
  @RequirePermission('episode', 'C')
  removeSeasonProduct(
    @Param('seasonId', ParseUUIDPipe) seasonId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.series.removeSeasonProduct(seasonId, productId, user);
  }

  // ─── Detail / Update ─────────────────────────────────────────

  @Get(':id')
  @RequirePermission('episode', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.series.get(id);
  }

  @Patch(':id')
  @RequirePermission('episode', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSeriesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.series.update(id, dto, user);
  }

  // ─── Cast & Locations ────────────────────────────────────────

  @Post(':id/characters')
  @RequirePermission('episode', 'C')
  addCharacter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SeriesCastDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.series.addCharacter(id, dto, user);
  }

  @Delete(':id/characters/:characterId')
  @RequirePermission('episode', 'C')
  removeCharacter(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.series.removeCharacter(id, characterId, user);
  }

  @Post(':id/locations')
  @RequirePermission('episode', 'C')
  addLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SeriesLocationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.series.addLocation(id, dto.locationId, user);
  }

  @Delete(':id/locations/:locationId')
  @RequirePermission('episode', 'C')
  removeLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.series.removeLocation(id, locationId, user);
  }

  // ─── Seasons (nested under series) ───────────────────────────

  @Post(':id/seasons')
  @RequirePermission('episode', 'C')
  createSeason(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSeasonDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.series.createSeason(id, dto, user);
  }

  // ─── สร้างตอนถัดไป (auto number + auto-link cast) ────────────

  @Post(':id/episodes')
  @RequirePermission('episode', 'C')
  createEpisode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSeriesEpisodeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.series.createEpisode(id, dto, user);
  }

  // ─── Layer 3: Analytics + Calendar ───────────────────────────

  @Get(':id/analytics')
  @RequirePermission('episode', 'V')
  analytics(@Param('id', ParseUUIDPipe) id: string) {
    return this.series.analytics(id);
  }

  @Post(':id/calendar-suggest')
  @RequirePermission('episode', 'C') // สิทธิ์ content C เช็คซ้ำใน service (สร้าง ContentItem)
  calendarSuggest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CalendarSuggestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.series.calendarSuggest(id, dto, user);
  }
}
