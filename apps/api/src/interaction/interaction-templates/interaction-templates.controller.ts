import {
  Body,
  Controller,
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
import { InteractionTemplatesService } from './interaction-templates.service';
import {
  CreateInteractionTemplateDto,
  ReplaceTemplateStepsDto,
  UpdateInteractionTemplateDto,
} from './dto/interaction-template.dto';

// Interaction Templates — "clip recipe" ต่อ packaging type · perm `library` (list V, mutate C)
@Controller('interaction-templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InteractionTemplatesController {
  constructor(private templates: InteractionTemplatesService) {}

  @Get()
  @RequirePermission('library', 'V')
  list(
    @Query('q') q?: string,
    @Query('packagingType') packagingType?: string,
    @Query('productCategory') productCategory?: string,
    @Query('storyboardType') storyboardType?: string,
    @Query('platform') platform?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.templates.list({
      q,
      packagingType,
      productCategory,
      storyboardType,
      platform,
      status,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  @Get(':id')
  @RequirePermission('library', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.get(id);
  }

  @Get(':id/validate')
  @RequirePermission('library', 'V')
  validate(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.validate(id);
  }

  @Get(':id/prompt-package')
  @RequirePermission('library', 'V')
  promptPackage(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.promptPackage(id);
  }

  @Post()
  @RequirePermission('library', 'C')
  create(@Body() dto: CreateInteractionTemplateDto, @CurrentUser() user: AuthUser) {
    return this.templates.create(dto, user);
  }

  @Post(':id/clone')
  @RequirePermission('library', 'C')
  clone(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.templates.clone(id, user);
  }

  @Patch(':id')
  @RequirePermission('library', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInteractionTemplateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.templates.update(id, dto, user);
  }

  @Patch(':id/archive')
  @RequirePermission('library', 'C')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.templates.archive(id, user);
  }

  @Put(':id/steps')
  @RequirePermission('library', 'C')
  replaceSteps(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceTemplateStepsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.templates.replaceSteps(id, dto, user);
  }
}
