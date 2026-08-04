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
import { LegalStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { RightsService } from './rights.service';
import { CreateRightDto } from './dto/create-right.dto';
import { UpdateRightDto } from './dto/update-right.dto';

class ChangeLegalStatusDto {
  @IsEnum(LegalStatus)
  legalStatus!: LegalStatus;
}

@Controller('rights')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RightsController {
  constructor(private rights: RightsService) {}

  @Get()
  @RequirePermission('rights', 'V')
  list(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('legalStatus') legalStatus?: LegalStatus,
    @Query('riskLevel') riskLevel?: string,
    @Query('commercialUsage') commercialUsage?: string,
    @Query('q') q?: string,
    @Query('sortBy') sortBy?: string,
    @Query('page') page?: string,
  ) {
    return this.rights.list({
      entityType,
      entityId,
      legalStatus,
      riskLevel,
      commercialUsage:
        commercialUsage === 'true' ? true : commercialUsage === 'false' ? false : undefined,
      q,
      sortBy,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  @Get(':id')
  @RequirePermission('rights', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.rights.get(id);
  }

  @Post()
  @RequirePermission('rights', 'C')
  create(@Body() dto: CreateRightDto, @CurrentUser() user: AuthUser) {
    return this.rights.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('rights', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRightDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.rights.update(id, dto, user);
  }

  @Patch(':id/status')
  @RequirePermission('rights', 'V') // สิทธิ์ C/A เช็คละเอียดใน service ตาม state machine
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeLegalStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.rights.changeStatus(id, dto.legalStatus, user);
  }
}
