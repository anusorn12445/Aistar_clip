import { IsIn, IsUUID } from 'class-validator';

// แหล่งของ Prompt Hub รอบนี้ (CEO ล็อก 6 แหล่ง — ยังไม่รวม Interaction Template / AI Director)
export const HUB_SOURCE_TYPES = [
  'location',
  'gesture',
  'camera_preset',
  'lighting_preset',
  'hand',
  'character',
] as const;

export type HubSourceType = (typeof HUB_SOURCE_TYPES)[number];

export class HubSnapshotDto {
  @IsIn(HUB_SOURCE_TYPES)
  sourceType!: HubSourceType;

  @IsUUID()
  sourceId!: string;
}
