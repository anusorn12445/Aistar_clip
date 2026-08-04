import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { AiToolsService } from './ai-tools.service';
import {
  CreateAiToolDto,
  CreateTopupDto,
  UpdateAiToolDto,
  UpdateTopupDto,
} from './dto/ai-tool.dto';

// จัดการ AI tool + credit top-up ledger — admin เท่านั้น (ai_usage action A)
@Controller('ai-tools')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiToolsController {
  constructor(private tools: AiToolsService) {}

  @Get()
  @RequirePermission('ai_usage', 'V')
  list() {
    return this.tools.listTools();
  }

  @Post()
  @RequirePermission('ai_usage', 'A')
  create(@Body() dto: CreateAiToolDto) {
    return this.tools.createTool(dto);
  }

  @Patch(':id')
  @RequirePermission('ai_usage', 'A')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAiToolDto) {
    return this.tools.updateTool(id, dto);
  }

  @Delete(':id')
  @RequirePermission('ai_usage', 'A')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.tools.deleteTool(id);
  }

  // ─── credit top-up ledger ต่อ tool ─────────────────────────
  @Get(':id/topups')
  @RequirePermission('ai_usage', 'A')
  listTopups(@Param('id', ParseUUIDPipe) id: string) {
    return this.tools.listTopups(id);
  }

  @Post(':id/topups')
  @RequirePermission('ai_usage', 'A')
  createTopup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTopupDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tools.createTopup(id, dto, user);
  }

  @Patch('topups/:topupId')
  @RequirePermission('ai_usage', 'A')
  updateTopup(
    @Param('topupId', ParseUUIDPipe) topupId: string,
    @Body() dto: UpdateTopupDto,
  ) {
    return this.tools.updateTopup(topupId, dto);
  }

  @Delete('topups/:topupId')
  @RequirePermission('ai_usage', 'A')
  removeTopup(@Param('topupId', ParseUUIDPipe) topupId: string) {
    return this.tools.deleteTopup(topupId);
  }
}
