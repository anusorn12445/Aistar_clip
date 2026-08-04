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
import { AiUsageService } from './ai-usage.service';
import {
  CreateAiUsageLogDto,
  UpdateAiUsageLogDto,
} from './dto/ai-usage-log.dto';

@Controller('ai-usage')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiUsageController {
  constructor(private usage: AiUsageService) {}

  @Post()
  @RequirePermission('ai_usage', 'C')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAiUsageLogDto) {
    return this.usage.create(user, dto);
  }

  // summary + link-search ต้องมาก่อน route :id (กันชน)
  @Get('summary')
  @RequirePermission('ai_usage', 'V')
  summary(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.usage.summary(user, from, to);
  }

  @Get('link-search')
  @RequirePermission('ai_usage', 'C')
  linkSearch(@Query('q') q: string) {
    return this.usage.linkSearch(q ?? '');
  }

  @Get()
  @RequirePermission('ai_usage', 'V')
  list(
    @CurrentUser() user: AuthUser,
    @Query('userId') userId?: string,
    @Query('aiToolId') aiToolId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.usage.list(user, { userId, aiToolId, from, to });
  }

  @Patch(':id')
  @RequirePermission('ai_usage', 'C')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAiUsageLogDto,
  ) {
    return this.usage.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission('ai_usage', 'C')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.usage.remove(user, id);
  }
}
