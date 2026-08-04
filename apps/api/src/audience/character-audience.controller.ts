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

// กลุ่มผู้ติดตามของ character — link ไปยัง taxonomy กลาง (permission `character`)
@Controller('characters')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CharacterAudienceController {
  constructor(private links: AudienceLinksService) {}

  @Get(':id/audiences')
  @RequirePermission('character', 'V')
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.links.getCharacterAudiences(id);
  }

  @Put(':id/audiences')
  @RequirePermission('character', 'C')
  set(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAudiencesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.links.setCharacterAudiences(id, dto.items, user);
  }
}
