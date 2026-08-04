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
import { TieInProductsService } from './tie-in-products.service';
import { SetTieInsDto } from './dto/tie-in.dto';

// สินค้าที่ tie-in กับโลเคชัน (ไม่บังคับ) — permission `location`
@Controller('locations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LocationTieInController {
  constructor(private tieIns: TieInProductsService) {}

  @Get(':id/tie-in-products')
  @RequirePermission('location', 'V')
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.tieIns.getLocationTieIns(id);
  }

  @Put(':id/tie-in-products')
  @RequirePermission('location', 'C')
  set(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTieInsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tieIns.setLocationTieIns(id, dto.items, user);
  }
}
