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
import { CompetitorsService } from './competitors.service';
import {
  ConvertInsightDto,
  CreateChannelDto,
  CreateCompetitorDto,
  CreateContentDto,
  CreateInsightDto,
  UpdateChannelDto,
  UpdateCompetitorDto,
} from './dto/competitor.dto';

@Controller('competitors')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CompetitorsController {
  constructor(private competitors: CompetitorsService) {}

  @Get()
  @RequirePermission('competitor', 'V')
  list(
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('threatLevel') threatLevel?: string,
    @Query('watchStatus') watchStatus?: string,
    @Query('category') category?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page?: string,
  ) {
    return this.competitors.list({
      q,
      type,
      threatLevel,
      watchStatus,
      category,
      sortBy,
      sortDir,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  @Get(':id')
  @RequirePermission('competitor', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.competitors.get(id);
  }

  @Post()
  @RequirePermission('competitor', 'C')
  create(@Body() dto: CreateCompetitorDto, @CurrentUser() user: AuthUser) {
    return this.competitors.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('competitor', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompetitorDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.competitors.update(id, dto, user);
  }

  // ── Channels ──────────────────────────────────────────────

  @Post(':id/channels')
  @RequirePermission('competitor', 'C')
  addChannel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateChannelDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.competitors.addChannel(id, dto, user);
  }

  @Patch(':id/channels/:channelId')
  @RequirePermission('competitor', 'C')
  updateChannel(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body() dto: UpdateChannelDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.competitors.updateChannel(id, channelId, dto, user);
  }

  @Delete(':id/channels/:channelId')
  @RequirePermission('competitor', 'C')
  removeChannel(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.competitors.removeChannel(id, channelId, user);
  }

  // ── Contents — เก็บ link + observation เท่านั้น (§18.5) ──

  @Post(':id/contents')
  @RequirePermission('competitor', 'C')
  addContent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateContentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.competitors.addContent(id, dto, user);
  }

  // ── Insights — §18.4 แยก Fact / Assumption / Recommendation ──

  @Post(':id/insights')
  @RequirePermission('competitor', 'C')
  addInsight(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInsightDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.competitors.addInsight(id, dto, user);
  }
}

// GET /insights ข้ามคู่แข่ง + convert-to-campaign
@Controller('insights')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InsightsController {
  constructor(private competitors: CompetitorsService) {}

  @Get()
  @RequirePermission('competitor', 'V')
  list(
    @Query('competitorId') competitorId?: string,
    @Query('q') q?: string,
    @Query('hasRecommendation') hasRecommendation?: string,
    @Query('page') page?: string,
  ) {
    return this.competitors.listInsights({
      competitorId,
      q,
      hasRecommendation,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  // สิทธิ์ campaign C เช็คละเอียดใน service
  @Post(':id/convert-to-campaign')
  @RequirePermission('competitor', 'C')
  convertToCampaign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertInsightDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.competitors.convertInsightToCampaign(id, dto, user);
  }
}
