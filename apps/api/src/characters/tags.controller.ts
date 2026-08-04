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
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { TagsService } from './tags.service';

class AddTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;
}

class ListTagsQuery {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  entityType?: string;
}

// Tag ผูกกับ module character (permission เดียวกัน: อ่าน = V, เขียน = C)
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TagsController {
  constructor(private tags: TagsService) {}

  @Get('tags')
  @RequirePermission('character', 'V')
  list(@Query() query: ListTagsQuery) {
    return this.tags.list(query.q, query.entityType);
  }

  @Post('characters/:id/tags')
  @RequirePermission('character', 'C')
  add(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTagDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tags.addToCharacter(id, dto.name, user);
  }

  @Delete('characters/:id/tags/:tagId')
  @RequirePermission('character', 'C')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tags.removeFromCharacter(id, tagId, user);
  }
}
