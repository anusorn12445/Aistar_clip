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
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Controller('locations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LocationsController {
  constructor(private locations: LocationsService) {}

  @Get()
  @RequirePermission('location', 'V')
  list(
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('regionStyle') regionStyle?: string,
    @Query('timeOfDay') timeOfDay?: string,
    @Query('status') status?: string,
    @Query('sortBy') sortBy?: string,
    @Query('page') page?: string,
  ) {
    return this.locations.list({
      q,
      type,
      regionStyle,
      timeOfDay,
      status,
      sortBy,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  @Get(':id')
  @RequirePermission('location', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.locations.get(id);
  }

  @Post()
  @RequirePermission('location', 'C')
  create(@Body() dto: CreateLocationDto, @CurrentUser() user: AuthUser) {
    return this.locations.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('location', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.locations.update(id, dto, user);
  }

  @Patch(':id/archive')
  @RequirePermission('location', 'C')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.locations.archive(id, user);
  }
}
