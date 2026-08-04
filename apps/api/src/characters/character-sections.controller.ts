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
import { IsInt, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { CharacterSectionsService } from './character-sections.service';

class CreateRelationshipDto {
  @IsUUID()
  toCharacterId!: string;

  @IsString()
  @Length(1, 40)
  relationType!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class UpdateRelationshipDto {
  @IsOptional()
  @IsString()
  @Length(1, 40)
  relationType?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class CreateWardrobeDto {
  @IsString()
  @Length(1, 60)
  name!: string;

  @IsOptional()
  @IsString()
  occasion?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class UpdateWardrobeDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsString()
  occasion?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

class CreateExpressionDto {
  @IsString()
  @Length(1, 60)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

// Pose (ท่าโพส) — โครงเดียวกับ Expression เป๊ะ
class CreatePoseDto {
  @IsString()
  @Length(1, 60)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class UpdatePoseDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

class UpdateExpressionDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

@Controller('characters')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CharacterSectionsController {
  constructor(private sections: CharacterSectionsService) {}

  // ─── Relationships ─────────────────────────────────────────

  @Get(':id/relationships')
  @RequirePermission('character', 'V')
  listRelationships(@Param('id', ParseUUIDPipe) id: string) {
    return this.sections.listRelationships(id);
  }

  @Post(':id/relationships')
  @RequirePermission('character', 'C')
  createRelationship(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRelationshipDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sections.createRelationship(id, dto, user);
  }

  @Patch(':id/relationships/:relId')
  @RequirePermission('character', 'C')
  updateRelationship(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('relId', ParseUUIDPipe) relId: string,
    @Body() dto: UpdateRelationshipDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sections.updateRelationship(id, relId, dto, user);
  }

  @Delete(':id/relationships/:relId')
  @RequirePermission('character', 'C')
  deleteRelationship(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('relId', ParseUUIDPipe) relId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sections.deleteRelationship(id, relId, user);
  }

  // ─── Wardrobe ──────────────────────────────────────────────

  @Get(':id/wardrobe')
  @RequirePermission('character', 'V')
  listWardrobe(@Param('id', ParseUUIDPipe) id: string) {
    return this.sections.listWardrobe(id);
  }

  @Post(':id/wardrobe')
  @RequirePermission('character', 'C')
  createWardrobe(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateWardrobeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sections.createWardrobe(id, dto, user);
  }

  @Patch(':id/wardrobe/:wid')
  @RequirePermission('character', 'C')
  updateWardrobe(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('wid', ParseUUIDPipe) wid: string,
    @Body() dto: UpdateWardrobeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sections.updateWardrobe(id, wid, dto, user);
  }

  @Delete(':id/wardrobe/:wid')
  @RequirePermission('character', 'C')
  deleteWardrobe(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('wid', ParseUUIDPipe) wid: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sections.deleteWardrobe(id, wid, user);
  }

  // ─── Expression ────────────────────────────────────────────

  @Get(':id/expressions')
  @RequirePermission('character', 'V')
  listExpressions(@Param('id', ParseUUIDPipe) id: string) {
    return this.sections.listExpressions(id);
  }

  @Post(':id/expressions')
  @RequirePermission('character', 'C')
  createExpression(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateExpressionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sections.createExpression(id, dto, user);
  }

  @Patch(':id/expressions/:eid')
  @RequirePermission('character', 'C')
  updateExpression(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('eid', ParseUUIDPipe) eid: string,
    @Body() dto: UpdateExpressionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sections.updateExpression(id, eid, dto, user);
  }

  @Delete(':id/expressions/:eid')
  @RequirePermission('character', 'C')
  deleteExpression(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('eid', ParseUUIDPipe) eid: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sections.deleteExpression(id, eid, user);
  }

  // ─── Pose (ท่าโพส — Character Sheet) ───────────────────────

  @Get(':id/poses')
  @RequirePermission('character', 'V')
  listPoses(@Param('id', ParseUUIDPipe) id: string) {
    return this.sections.listPoses(id);
  }

  @Post(':id/poses')
  @RequirePermission('character', 'C')
  createPose(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePoseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sections.createPose(id, dto, user);
  }

  @Patch(':id/poses/:pid')
  @RequirePermission('character', 'C')
  updatePose(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pid', ParseUUIDPipe) pid: string,
    @Body() dto: UpdatePoseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sections.updatePose(id, pid, dto, user);
  }

  @Delete(':id/poses/:pid')
  @RequirePermission('character', 'C')
  deletePose(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pid', ParseUUIDPipe) pid: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sections.deletePose(id, pid, user);
  }
}
