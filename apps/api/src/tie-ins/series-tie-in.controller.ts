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

// สินค้าที่ tie-in กับซีรีส์ (ไม่บังคับ) — permission `episode` (module เดียวกับ series)
@Controller('series')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SeriesTieInController {
  constructor(private tieIns: TieInProductsService) {}

  @Get(':id/tie-in-products')
  @RequirePermission('episode', 'V')
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.tieIns.getSeriesTieIns(id);
  }

  @Put(':id/tie-in-products')
  @RequirePermission('episode', 'C')
  set(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTieInsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tieIns.setSeriesTieIns(id, dto.items, user);
  }
}
