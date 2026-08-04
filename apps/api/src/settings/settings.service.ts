import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SETTING_GROUPS,
  SETTING_KEYS,
  SettingGroup,
  findSettingKey,
} from './setting-keys';

// cache ค่าจาก DB 30 วินาที — AI services เรียก get() ทุก request จะได้ไม่ยิง DB ถี่เกิน
const CACHE_TTL_MS = 30_000;

export interface SettingListItem {
  key: string;
  group: SettingGroup;
  isSecret: boolean;
  hasValue: boolean;
  source: 'db' | 'env' | null;
  // secret → mask เหลือ 4 ตัวท้าย ('••••abcd') / non-secret → ค่าเต็ม / ไม่ตั้งค่า → null
  preview: string | null;
}

export interface SettingsList {
  groups: { group: SettingGroup; items: SettingListItem[] }[];
}

function hasText(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== '';
}

function maskSecret(value: string): string {
  return value.length > 4 ? `••••${value.slice(-4)}` : '••••••••';
}

@Injectable()
export class SettingsService {
  private cache = new Map<string, { value: string | undefined; at: number }>();

  constructor(private prisma: PrismaService) {}

  /** ค่า setting: DB (override) → fallback process.env → undefined (ค่าว่างนับเป็นไม่ตั้งค่า) */
  async get(key: string): Promise<string | undefined> {
    const dbValue = await this.getDbValue(key);
    if (hasText(dbValue)) return dbValue;
    const envValue = process.env[key];
    return hasText(envValue) ? envValue : undefined;
  }

  private async getDbValue(key: string): Promise<string | undefined> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    this.cache.set(key, { value: row?.value, at: Date.now() });
    return row?.value;
  }

  /** รายการ setting ทั้งหมดตาม whitelist จัดกลุ่ม — ไม่มีวันคืนค่า secret เต็ม ๆ */
  async list(): Promise<SettingsList> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: SETTING_KEYS.map((d) => d.key) } },
    });
    const dbByKey = new Map(rows.map((r) => [r.key, r.value]));

    const items: SettingListItem[] = SETTING_KEYS.map((def) => {
      const dbValue = dbByKey.get(def.key);
      const envValue = process.env[def.key];
      const value = hasText(dbValue) ? dbValue : hasText(envValue) ? envValue : undefined;
      const source: 'db' | 'env' | null = hasText(dbValue)
        ? 'db'
        : hasText(envValue)
          ? 'env'
          : null;
      return {
        key: def.key,
        group: def.group,
        isSecret: def.isSecret,
        hasValue: value !== undefined,
        source,
        preview:
          value === undefined ? null : def.isSecret ? maskSecret(value) : value,
      };
    });

    return {
      groups: SETTING_GROUPS.map((group) => ({
        group,
        items: items.filter((i) => i.group === group),
      })),
    };
  }

  /**
   * บันทึกหลายค่าในครั้งเดียว — key ต้องอยู่ใน whitelist เท่านั้น
   * ค่าว่าง = ลบ row ใน DB (กลับไปใช้ค่าจาก .env) / audit บันทึกเฉพาะชื่อ key ไม่บันทึก value เด็ดขาด
   */
  async setMany(items: { key: string; value: string }[], userId: string): Promise<SettingsList> {
    if (!items.length) {
      throw new BadRequestException('ไม่มีรายการตั้งค่าให้บันทึก');
    }
    const unknown = items.filter((i) => !findSettingKey(i.key));
    if (unknown.length) {
      throw new BadRequestException(
        `ไม่รู้จัก setting key: ${unknown.map((i) => i.key).join(', ')}`,
      );
    }

    for (const item of items) {
      const def = findSettingKey(item.key)!;
      const value = item.value.trim();
      if (!value) {
        // ค่าว่าง = ล้างค่า override — กลับไปใช้ค่าจาก .env (ถ้ามี)
        await this.prisma.systemSetting.deleteMany({ where: { key: item.key } });
      } else {
        await this.prisma.systemSetting.upsert({
          where: { key: item.key },
          update: { value, isSecret: def.isSecret, updatedBy: userId },
          create: { key: item.key, value, isSecret: def.isSecret, updatedBy: userId },
        });
      }
      this.cache.delete(item.key);
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        via: 'ui',
        action: 'settings_update',
        entityType: 'system_setting',
        // ห้าม log ค่า setting (โดยเฉพาะ secret) — เก็บเฉพาะรายชื่อ key
        meta: { keys: items.map((i) => i.key) } as unknown as Prisma.InputJsonValue,
      },
    });

    return this.list();
  }
}
