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
import { CampaignStatus } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

class ChangeCampaignStatusDto {
  @IsEnum(CampaignStatus)
  status!: CampaignStatus;
}

class LinkCharacterDto {
  @IsUUID()
  characterId!: string;
}

class LinkProductDto {
  @IsUUID()
  productId!: string;
}

@Controller('campaigns')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CampaignsController {
  constructor(private campaigns: CampaignsService) {}

  @Get()
  @RequirePermission('campaign', 'V')
  list(
    @Query('q') q?: string,
    @Query('status') status?: CampaignStatus,
    @Query('objective') objective?: string,
    @Query('characterId') characterId?: string,
    @Query('productId') productId?: string,
    @Query('ownerId') ownerId?: string,
    @Query('startFrom') startFrom?: string,
    @Query('startTo') startTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.campaigns.list({
      q,
      status,
      objective,
      characterId,
      productId,
      ownerId,
      startFrom,
      startTo,
      sortBy,
      sortDir,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission('campaign', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.get(id);
  }

  @Post()
  @RequirePermission('campaign', 'C')
  create(@Body() dto: CreateCampaignDto, @CurrentUser() user: AuthUser) {
    return this.campaigns.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('campaign', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.campaigns.update(id, dto, user);
  }

  @Patch(':id/status')
  @RequirePermission('campaign', 'C') // สิทธิ์ A สำหรับ publish เช็คละเอียดใน service
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeCampaignStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.campaigns.changeStatus(id, dto.status, user);
  }

  @Post(':id/characters')
  @RequirePermission('campaign', 'C')
  addCharacter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkCharacterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.campaigns.addCharacter(id, dto.characterId, user);
  }

  @Delete(':id/characters/:characterId')
  @RequirePermission('campaign', 'C')
  removeCharacter(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('characterId', ParseUUIDPipe) characterId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.campaigns.removeCharacter(id, characterId, user);
  }

  @Post(':id/products')
  @RequirePermission('campaign', 'C')
  addProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkProductDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.campaigns.addProduct(id, dto.productId, user);
  }

  @Delete(':id/products/:productId')
  @RequirePermission('campaign', 'C')
  removeProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.campaigns.removeProduct(id, productId, user);
  }
}
