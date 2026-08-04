import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { PromptsService } from './prompts.service';
import { CreateGenerationRunDto } from './dto/create-generation-run.dto';

@Controller('prompt-versions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PromptVersionsController {
  constructor(private prompts: PromptsService) {}

  // บันทึกผลการ generate จริง — chain: prompt_version → run → asset → qc_score (§F.2)
  @Post(':versionId/runs')
  @RequirePermission('prompt', 'C')
  createRun(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: CreateGenerationRunDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.prompts.createRun(versionId, dto, user);
  }
}
