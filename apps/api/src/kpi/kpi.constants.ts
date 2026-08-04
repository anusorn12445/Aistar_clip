// ─── KPI metric ↔ audit-log map (single source of truth) ─────────────────
// ทุก metric นับจาก audit_logs (action='create') โดย bucket ตาม entityType
// ยืนยันแล้วว่าทุก entityType ด้านล่าง audit create พร้อม actorId → นับรายคนได้:
//   character → characters.service (entityType 'character')
//   episode   → episodes.service + series.createEpisode (entityType 'episode')
//   series    → series.service (entityType 'series')
//   content   → content-items.service (entityType 'content_item')
//   shot      → shots.service (entityType 'shot')  ← มี actorId ครบ
// content_created รวม content_item + shot เป็น metric เดียว ("สร้าง Content/Shot")
export interface MetricDef {
  entityTypes: string[];
  label: string;
  icon: string;
}

export const METRIC_AUDIT: Record<string, MetricDef> = {
  character_created: { entityTypes: ['character'], label: 'สร้าง Character', icon: '🎭' },
  episode_created: { entityTypes: ['episode'], label: 'สร้าง Episode', icon: '🎬' },
  series_created: { entityTypes: ['series'], label: 'สร้าง Series', icon: '📺' },
  content_created: {
    entityTypes: ['content_item', 'shot'],
    label: 'สร้าง Content/Shot',
    icon: '✂️',
  },
};

export const METRIC_KEYS = Object.keys(METRIC_AUDIT);
export const PERIODS = ['weekly', 'monthly'] as const;
export type Period = (typeof PERIODS)[number];

// entityType → metricKey (reverse lookup สำหรับ bucket ผล groupBy)
export const ENTITY_TO_METRIC: Record<string, string> = Object.entries(METRIC_AUDIT).reduce(
  (acc, [metric, def]) => {
    for (const et of def.entityTypes) acc[et] = metric;
    return acc;
  },
  {} as Record<string, string>,
);

// entityTypes ทั้งหมดที่เกี่ยวข้อง (ไว้ query auditLog รอบเดียว)
export const ALL_ENTITY_TYPES = [
  ...new Set(Object.values(METRIC_AUDIT).flatMap((d) => d.entityTypes)),
];

// Asia/Bangkok = UTC+7 ตายตัว ไม่มี DST → ใช้ offset คงที่คำนวณ wall-clock ได้เลย
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * ช่วงเวลาปัจจุบัน [start, end) ของ period ตามเขตเวลา Asia/Bangkok
 * (สัปดาห์เริ่มวันจันทร์). คืน Date เป็น UTC สำหรับ query createdAt ตรง ๆ
 */
export function currentPeriod(
  period: Period,
  now: Date = new Date(),
): { start: Date; end: Date } {
  // เลื่อนเป็นเวลา wall-clock ของกรุงเทพ แล้วอ่านค่าด้วย getUTC*
  const local = new Date(now.getTime() + BKK_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();

  let startLocal: number;
  let endLocal: number;
  if (period === 'weekly') {
    const dow = local.getUTCDay(); // 0=อาทิตย์ .. 6=เสาร์
    const daysSinceMonday = (dow + 6) % 7;
    startLocal = Date.UTC(y, m, d - daysSinceMonday, 0, 0, 0, 0);
    endLocal = startLocal + 7 * 24 * 60 * 60 * 1000;
  } else {
    startLocal = Date.UTC(y, m, 1, 0, 0, 0, 0);
    endLocal = Date.UTC(y, m + 1, 1, 0, 0, 0, 0);
  }
  return {
    start: new Date(startLocal - BKK_OFFSET_MS),
    end: new Date(endLocal - BKK_OFFSET_MS),
  };
}
