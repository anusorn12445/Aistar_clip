import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSION_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<{ module: string; action: string }>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.roles?.length) throw new ForbiddenException();

    const count = await this.prisma.rolePermission.count({
      where: {
        module: required.module,
        actions: { has: required.action },
        role: { key: { in: user.roles } },
      },
    });
    if (count === 0) {
      throw new ForbiddenException(
        `ต้องมีสิทธิ์ ${required.action} ใน module ${required.module}`,
      );
    }
    return true;
  }
}
