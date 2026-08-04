// รวมผล "วิเคราะห์จากรูป" (CharacterCaptureResult) เข้า Character ตัวเดิม
// โหมด: fill_empty = เติมเฉพาะช่องที่ยังว่าง (ปลอดภัย ค่าเดิมไม่หาย)
//        overwrite  = Visual DNA จากรูปเขียนทับของเดิม (รูปคือหลักฐานตรง) — persona ยังเติมเฉพาะช่องว่างเสมอ
//        เพราะบุคลิกจากรูปเป็นการตีความ ไม่ควรทับของที่คนเขียนไว้

export type AnalyzeMergeMode = 'fill_empty' | 'overwrite';

const isEmpty = (v: unknown): boolean =>
  v == null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);

function mergeSection(
  current: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
  overwrite: boolean,
): { merged: Record<string, unknown>; applied: string[] } {
  const merged: Record<string, unknown> = { ...(current ?? {}) };
  const applied: string[] = [];
  for (const [k, v] of Object.entries(incoming ?? {})) {
    if (isEmpty(v)) continue; // AI ไม่เห็น/เว้นว่าง — อย่าลบของเดิม
    if (overwrite || isEmpty(merged[k])) {
      merged[k] = v;
      applied.push(k);
    }
  }
  return { merged, applied };
}

export interface CharacterScalars {
  age?: number | null;
  gender?: string | null;
  region?: string | null;
  roleLabel?: string | null;
}

export function mergeCaptureIntoCharacter(
  current: {
    persona?: Record<string, unknown> | null;
    visualDna?: Record<string, unknown> | null;
    commerceProfile?: Record<string, unknown> | null;
    voiceProfile?: Record<string, unknown> | null;
  } & CharacterScalars,
  draft: {
    persona?: Record<string, unknown>;
    visualDna?: Record<string, unknown>;
    commerceProfile?: Record<string, unknown>;
    voiceProfile?: Record<string, unknown>;
    suggested?: { age?: number; gender?: string; region?: string; roleLabel?: string };
  },
  mode: AnalyzeMergeMode,
): {
  data: {
    persona: Record<string, unknown>;
    visualDna: Record<string, unknown>;
    commerceProfile: Record<string, unknown>;
    voiceProfile: Record<string, unknown>;
  } & Partial<CharacterScalars>;
  applied: {
    persona: string[];
    visualDna: string[];
    commerceProfile: string[];
    voiceProfile: string[];
    scalars: string[];
  };
} {
  // Visual DNA: จากรูปโดยตรง — overwrite ได้เมื่อผู้ใช้เลือก
  const vd = mergeSection(current.visualDna, draft.visualDna, mode === 'overwrite');
  // Persona: การตีความจากรูป — เติมเฉพาะช่องว่างเสมอ ไม่ทับของคนเขียน
  const ps = mergeSection(current.persona, draft.persona, false);
  // Commerce/Voice: ตีความเชิงกลยุทธ์/เสียง — เติมเฉพาะช่องว่าง (ไม่ทับที่ตั้งใจกำหนด)
  const cp = mergeSection(current.commerceProfile, draft.commerceProfile, false);
  const vp = mergeSection(current.voiceProfile, draft.voiceProfile, false);

  const data: ReturnType<typeof mergeCaptureIntoCharacter>['data'] = {
    persona: ps.merged,
    visualDna: vd.merged,
    commerceProfile: cp.merged,
    voiceProfile: vp.merged,
  };
  const scalars: string[] = [];
  const sug = draft.suggested ?? {};
  if (isEmpty(current.age) && sug.age != null && sug.age >= 18) {
    data.age = sug.age;
    scalars.push('age');
  }
  if (isEmpty(current.gender) && !isEmpty(sug.gender)) {
    data.gender = sug.gender;
    scalars.push('gender');
  }
  if (isEmpty(current.region) && !isEmpty(sug.region)) {
    data.region = sug.region;
    scalars.push('region');
  }
  if (isEmpty(current.roleLabel) && !isEmpty(sug.roleLabel)) {
    data.roleLabel = sug.roleLabel;
    scalars.push('roleLabel');
  }
  return {
    data,
    applied: {
      persona: ps.applied,
      visualDna: vd.applied,
      commerceProfile: cp.applied,
      voiceProfile: vp.applied,
      scalars,
    },
  };
}
