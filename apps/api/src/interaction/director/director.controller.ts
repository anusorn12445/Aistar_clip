import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../../auth/current-user.decorator';
import { DirectorService } from './director.service';
import { ListDirectorRunsQuery, RecommendDirectorDto } from './dto/director.dto';

// AI Director (SRS slice 4, §3.13) — แนะนำสูตรคลิปด้วย Claude → บันทึกเป็น InteractionTemplate
// perm `library` (list/detail V, mutate C) — เดียวกับคลัง Interaction ทั้งหมด
@Controller('director')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DirectorController {
  constructor(private director: DirectorService) {}

  @Get('status')
  @RequirePermission('library', 'V')
  status() {
    return this.director.status();
  }

  @Get()
  @RequirePermission('library', 'V')
  list(@Query() query: ListDirectorRunsQuery) {
    return this.director.list(query);
  }

  @Get(':id')
  @RequirePermission('library', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.director.get(id);
  }

  @Post('recommend')
  @RequirePermission('library', 'C')
  recommend(@Body() dto: RecommendDirectorDto, @CurrentUser() user: AuthUser) {
    return this.director.recommend(dto, user);
  }

  @Post(':id/apply')
  @RequirePermission('library', 'C')
  apply(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.director.apply(id, user);
  }

  @Delete(':id')
  @RequirePermission('library', 'C')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.director.remove(id, user);
  }
}
