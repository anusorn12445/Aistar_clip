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
import { PartialType } from '@nestjs/mapped-types';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { CreatorsService } from './creators.service';

class CreateCreatorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  line?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  portfolio?: string;

  @IsOptional()
  @IsString()
  rateNote?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class UpdateCreatorDto extends PartialType(CreateCreatorDto) {}

class ListCreatorsQuery {
  @IsOptional()
  @IsString()
  q?: string;
}

// Creators — ทะเบียนผู้สร้างตัวละคร (freelance/ทีมใน) เก็บ contact ไว้ตามตัว
// ผูกกับ permission module character เหมือน tags (อ่าน = V, เขียน = C)
@Controller('creators')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CreatorsController {
  constructor(private creators: CreatorsService) {}

  @Get()
  @RequirePermission('character', 'V')
  list(@Query() query: ListCreatorsQuery) {
    return this.creators.list(query.q);
  }

  @Get(':id')
  @RequirePermission('character', 'V')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.creators.get(id);
  }

  @Post()
  @RequirePermission('character', 'C')
  create(@Body() dto: CreateCreatorDto, @CurrentUser() user: AuthUser) {
    return this.creators.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('character', 'C')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCreatorDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.creators.update(id, dto, user);
  }
}
