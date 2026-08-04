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
import { IdeaStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { IdeasService } from './ideas.service';
import { ChangeIdeaStatusDto, ConvertIdeaDto, CreateIdeaDto, UpdateIdeaDto } from './dto/idea.dto';

@Controller('ideas')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IdeasController {
  constructor(private ideas: IdeasService) {}

  @Get()
  @RequirePermission('idea', 'V')
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('ideaType') ideaType?: string,
    @Query('status') status?: IdeaStatus,
    @Query('createdBy') createdBy?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page?: string,
  ) {
    return this.ideas.list(
      {
        q,
        ideaType,
        status,
        createdBy,
        dateFrom,
        dateTo,
        sortBy,
        sortDir,
        page: page ? parseInt(page, 10) : 1,
      },
      user,
    );
  }

  @Get(':id')
  @RequirePermission('idea', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.ideas.get(id);
  }

  @Post()
  @RequirePermission('idea', 'C')
  create(@Body() dto: CreateIdeaDto, @CurrentUser() user: AuthUser) {
    return this.ideas.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('idea', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIdeaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ideas.update(id, dto, user);
  }

  @Patch(':id/status')
  @RequirePermission('idea', 'C')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeIdeaStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ideas.changeStatus(id, dto.status, user);
  }

  @Post(':id/ai-assist')
  @RequirePermission('idea', 'C')
  aiAssist(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.ideas.aiAssistIdea(id, user);
  }

  // สิทธิ์ campaign/episode C เช็คละเอียดใน service
  @Post(':id/convert')
  @RequirePermission('idea', 'C')
  convert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertIdeaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ideas.convert(id, dto, user);
  }
}
