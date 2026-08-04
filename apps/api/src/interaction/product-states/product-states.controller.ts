import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { ProductStatesService } from './product-states.service';
import {
  CreateProductStateDto,
  ReorderProductStatesDto,
  SetTransitionsDto,
  UpdateProductStateDto,
  ValidateSequenceDto,
} from './dto/product-state.dto';

// ProductState taxonomy + transitions — perm `setting` (list V, mutate C)
// NOTE: static routes (transitions / validate-sequence / reorder) ประกาศก่อน :id เพื่อกัน route ชน
@Controller('product-states')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductStatesController {
  constructor(private states: ProductStatesService) {}

  @Get('transitions')
  @RequirePermission('setting', 'V')
  getTransitions() {
    return this.states.getTransitions();
  }

  @Put('transitions')
  @RequirePermission('setting', 'C')
  setTransitions(@Body() dto: SetTransitionsDto, @CurrentUser() user: AuthUser) {
    return this.states.setTransitions(dto, user);
  }

  @Post('validate-sequence')
  @RequirePermission('setting', 'V')
  validateSequence(@Body() dto: ValidateSequenceDto) {
    return this.states.validateSequence(dto);
  }

  @Post('reorder')
  @RequirePermission('setting', 'C')
  reorder(@Body() dto: ReorderProductStatesDto, @CurrentUser() user: AuthUser) {
    return this.states.reorder(dto, user);
  }

  @Get()
  @RequirePermission('setting', 'V')
  list(@Query('status') status?: string) {
    return this.states.list({ status });
  }

  @Post()
  @RequirePermission('setting', 'C')
  create(@Body() dto: CreateProductStateDto, @CurrentUser() user: AuthUser) {
    return this.states.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('setting', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductStateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.states.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('setting', 'C')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.states.remove(id, user);
  }
}
