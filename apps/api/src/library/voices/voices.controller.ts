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
import { IsIn } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { VoicesService } from './voices.service';
import { CreateVoiceDto } from './dto/create-voice.dto';
import { UpdateVoiceDto } from './dto/update-voice.dto';

class ChangeVoiceStatusDto {
  @IsIn(['draft', 'approved', 'archived'])
  status!: string;
}

@Controller('voices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VoicesController {
  constructor(private voices: VoicesService) {}

  @Get()
  @RequirePermission('voice', 'V')
  list(
    @Query('characterId') characterId?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('sortBy') sortBy?: string,
    @Query('page') page?: string,
  ) {
    return this.voices.list({
      characterId,
      q,
      status,
      sortBy,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  @Get(':id')
  @RequirePermission('voice', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.voices.get(id);
  }

  @Post()
  @RequirePermission('voice', 'C')
  create(@Body() dto: CreateVoiceDto, @CurrentUser() user: AuthUser) {
    return this.voices.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('voice', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.voices.update(id, dto, user);
  }

  @Patch(':id/status')
  @RequirePermission('voice', 'V') // สิทธิ์ A เช็คละเอียดใน service (pattern จาก characters)
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeVoiceStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.voices.changeStatus(id, dto.status, user);
  }
}
