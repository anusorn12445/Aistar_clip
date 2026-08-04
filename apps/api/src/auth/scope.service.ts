import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './current-user.decorator';

export type ViewScope = 'all' | 'team' | 'own';

export const VIEW_SCOPES: ViewScope[] = ['all', 'team', 'own'];

// Modules ที่รองรับ row-level viewScope — เฉพาะ "งาน" (work items):
//   content (ContentItem: owner/reviewer) · episode (Episode + Shots: episode owner)
//   image_request (requester/assignee)
// catalog ที่แชร์กันทั้งทีม (characters/prompts/brands/products/locations/media) ไม่ scope
// Phase 2 (done): dashboard/calendar aggregates + ค่า 'team' (เห็นงานของสมาชิกทีมเดียวกัน)
export const SCOPED_MODULES = ['content', 'episode'] as const;

@Injectable()
export class ScopeService {
  constructor(private prisma: PrismaService) {}

  /**
   * viewScope ของ user ต่อ module — กติกา most-permissive wins (all > team > own):
   *   - role ไหนสักตัวเป็น 'all' (หรือค่าที่ไม่รู้จัก → fail open) → 'all'
   *   - ไม่มี 'all' แต่มี 'team' สักตัว → 'team'
   *   - ทุก role ที่มีแถวเป็น 'own' → 'own'
   *   - ไม่มีแถว role_permission เลย → 'all' (backward compat — PermissionsGuard กั้นการเข้าถึง module อยู่แล้ว)
   * query สดต่อ request เช่นเดียวกับ PermissionsGuard (ไม่ cache — เปลี่ยน scope ใน UI แล้วมีผลทันที)
   */
  async resolveViewScope(user: AuthUser, module: string): Promise<ViewScope> {
    const roles = user?.roles ?? [];
    if (!roles.length) return 'all';
    const rows = await this.prisma.rolePermission.findMany({
      where: { module, role: { key: { in: roles } } },
      select: { viewScope: true },
    });
    if (!rows.length) return 'all';
    // ค่าที่ไม่รู้จัก (อนาคต) fail-open เป็น 'all'
    if (rows.some((r) => r.viewScope !== 'own' && r.viewScope !== 'team')) return 'all';
    return rows.some((r) => r.viewScope === 'team') ? 'team' : 'own';
  }

  /**
   * ชุด userId ที่ scope นี้ "มองเห็นงานของ" —
   *   'all'  → null (ผู้เรียกไม่ต้องกรอง)
   *   'team' → สมาชิกทุกคนที่อยู่ทีม active ร่วมกับตัวเองอย่างน้อย 1 ทีม + ตัวเอง
   *   'own'  → [ตัวเอง]
   * query สดต่อ call site (pattern เดียวกับ resolveViewScope — ไม่ cache ข้าม request)
   */
  async getVisibleUserIds(user: AuthUser, scope: ViewScope): Promise<string[] | null> {
    if (scope === 'all') return null;
    if (scope === 'own') return [user.id];
    // 'team' — ทีมที่ตัวเองสังกัด (เฉพาะทีม active) → สมาชิกทุกคนของทีมเหล่านั้น
    const myTeams = await this.prisma.teamMember.findMany({
      where: { userId: user.id, team: { status: 'active' } },
      select: { teamId: true },
    });
    if (!myTeams.length) return [user.id];
    const mates = await this.prisma.teamMember.findMany({
      where: { teamId: { in: myTeams.map((t) => t.teamId) } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const ids = new Set(mates.map((m) => m.userId));
    ids.add(user.id);
    return [...ids];
  }

  /** ทางลัด: resolve scope ของ module แล้วคืนชุด userId ที่มองเห็น (null = ไม่ต้องกรอง) */
  async resolveVisibleUserIds(user: AuthUser, module: string): Promise<string[] | null> {
    const scope = await this.resolveViewScope(user, module);
    return this.getVisibleUserIds(user, scope);
  }
}
