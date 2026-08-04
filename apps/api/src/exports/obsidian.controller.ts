import { Controller, Get, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { ObsidianService } from './obsidian.service';

// Obsidian Vault Export (PRD v0.1 §26) — สิทธิ์ E เหมือน export package (Admin/Founder/Creative Lead)
// status poll ใช้ GET /exports/:jobId เดิม — download ใช้ route เฉพาะของ vault
@Controller('exports/obsidian')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ObsidianController {
  constructor(private obsidian: ObsidianService) {}

  @Post()
  @RequirePermission('character', 'E')
  createVaultExport(@CurrentUser() user: AuthUser) {
    return this.obsidian.createVaultExport(user);
  }

  @Get(':jobId/download')
  @RequirePermission('character', 'E')
  download(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    return this.obsidian.download(jobId, user, res);
  }
}
