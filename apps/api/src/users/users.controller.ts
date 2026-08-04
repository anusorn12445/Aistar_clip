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
import { UserStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateRolePermissionDto } from './dto/update-role-permission.dto';
import { CreateTeamDto, SetTeamMembersDto, UpdateTeamDto } from './dto/team.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  @RequirePermission('user', 'V')
  list(
    @Query('q') q?: string,
    @Query('role') role?: string,
    @Query('status') status?: UserStatus,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.users.list({
      q,
      role,
      status,
      createdFrom,
      createdTo,
      sortBy,
      sortDir,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Post()
  @RequirePermission('user', 'X')
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.users.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('user', 'X')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.update(id, dto, user);
  }
}

// รายชื่อบทบาทสำหรับ role select ในหน้า Users
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private users: UsersService) {}

  @Get()
  @RequirePermission('user', 'V')
  list() {
    return this.users.listRoles();
  }

  // matrix สิทธิ์ + viewScope ต่อ role×module (ใช้ในหน้า Users & Roles)
  @Get('permissions')
  @RequirePermission('user', 'V')
  listPermissions() {
    return this.users.listRolePermissions();
  }

  // ปรับ viewScope ('all' | 'team' | 'own') ของ role×module — สิทธิ์เดียวกับการแก้ user
  @Patch(':key/permissions/:module')
  @RequirePermission('user', 'X')
  updatePermission(
    @Param('key') key: string,
    @Param('module') module: string,
    @Body() dto: UpdateRolePermissionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.updateRolePermission(key, module, dto.viewScope, user);
  }
}

// ทีม (viewScope 'team') — สิทธิ์ระดับเดียวกับการแก้ role-permission: ดู=user V, แก้=user X
@Controller('teams')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TeamsController {
  constructor(private users: UsersService) {}

  @Get()
  @RequirePermission('user', 'V')
  list() {
    return this.users.listTeams();
  }

  @Post()
  @RequirePermission('user', 'X')
  create(@Body() dto: CreateTeamDto, @CurrentUser() user: AuthUser) {
    return this.users.createTeam(dto.name, user);
  }

  @Patch(':id')
  @RequirePermission('user', 'X')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.updateTeam(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('user', 'X')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.users.deleteTeam(id, user);
  }

  // replace-set สมาชิกทั้งชุด
  @Put(':id/members')
  @RequirePermission('user', 'X')
  setMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTeamMembersDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.users.setTeamMembers(id, dto.userIds, user);
  }
}
