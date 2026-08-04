import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { AudienceLinksService } from './audience-links.service';
import { SetAudiencesDto } from './dto/audience-segment.dto';

// คนดูเป้าหมายของ series — link ไปยัง taxonomy กลาง (permission `episode` — module เดียวกับ series)
@Controller('series')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SeriesAudienceController {
  constructor(private links: AudienceLinksService) {}

  @Get(':id/audiences')
  @RequirePermission('episode', 'V')
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.links.getSeriesAudiences(id);
  }

  @Put(':id/audiences')
  @RequirePermission('episode', 'C')
  set(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAudiencesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.links.setSeriesAudiences(id, dto.items, user);
  }
}
