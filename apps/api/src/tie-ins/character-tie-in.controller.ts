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

// สินค้าที่ tie-in กับตัวละคร (ไม่บังคับ) — permission `character`
@Controller('characters')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CharacterTieInController {
  constructor(private tieIns: TieInProductsService) {}

  @Get(':id/tie-in-products')
  @RequirePermission('character', 'V')
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.tieIns.getCharacterTieIns(id);
  }

  @Put(':id/tie-in-products')
  @RequirePermission('character', 'C')
  set(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTieInsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tieIns.setCharacterTieIns(id, dto.items, user);
  }
}
