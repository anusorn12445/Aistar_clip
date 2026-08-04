// Whitelist ของ system settings ที่แก้ผ่านหน้า Settings ได้ — single source of truth
// key ใดไม่อยู่ในลิสต์นี้ = ปฏิเสธ (400) เสมอ

export const SETTING_GROUPS = ['ai', 'storage', 'notify'] as const;
export type SettingGroup = (typeof SETTING_GROUPS)[number];

export interface SettingKeyDef {
  key: string;
  isSecret: boolean;
  group: SettingGroup;
}

export const SETTING_KEYS: readonly SettingKeyDef[] = [
  { key: 'ANTHROPIC_API_KEY', isSecret: true, group: 'ai' },
  { key: 'ANTHROPIC_MODEL', isSecret: false, group: 'ai' },
  // 🎨 คีย์สำหรับฟีเจอร์ gen ภาพในระบบ (เฟสถัดไป) — เก็บคีย์ไว้ก่อน
  { key: 'OPENAI_API_KEY', isSecret: true, group: 'ai' },
  { key: 'OPENAI_MODEL', isSecret: false, group: 'ai' },
  { key: 'AI_PROVIDER', isSecret: false, group: 'ai' },
  { key: 'XAI_API_KEY', isSecret: true, group: 'ai' },
  { key: 'R2_ACCOUNT_ID', isSecret: false, group: 'storage' },
  { key: 'R2_ACCESS_KEY_ID', isSecret: true, group: 'storage' },
  { key: 'R2_SECRET_ACCESS_KEY', isSecret: true, group: 'storage' },
  { key: 'R2_BUCKET', isSecret: false, group: 'storage' },
  { key: 'R2_PUBLIC_DOMAIN', isSecret: false, group: 'storage' },
  { key: 'LINE_CHANNEL_ACCESS_TOKEN', isSecret: true, group: 'notify' },
] as const;

export function findSettingKey(key: string): SettingKeyDef | undefined {
  return SETTING_KEYS.find((d) => d.key === key);
}
