// คลังเสียง Flow (native) — เสียงที่ Veo/Flow สร้างเองจากคำบรรยาย (ไม่ใช่ไฟล์เสียง/voice profile ของ AISTAR)
// เลือกจากคลังนี้ → เติมลง job.voiceSpec (บรรทัด VOICE ของ prompt วิดีโอทุกฉาก)

export interface FlowVoice {
  key: string;
  label: string; // ป้ายไทยใน dropdown
  spec: string; // EN — VOICE SPEC ที่ป้อน Veo ให้สร้างเสียง native แนวนี้
}

export const FLOW_VOICES: FlowVoice[] = [
  { key: 'th_f_bright', label: 'หญิงไทย สดใส เป็นกันเอง (รีวิว TikTok)', spec: 'Thai female voice, age 20–30, bright cheerful and friendly TikTok UGC review style, natural conversational pace' },
  { key: 'th_f_soft', label: 'หญิงไทย นุ่มนวล อบอุ่น', spec: 'Thai female voice, age 25–35, soft warm and gentle tone, calm unhurried pace, sincere and reassuring' },
  { key: 'th_f_mature', label: 'หญิงไทย ผู้ใหญ่ น่าเชื่อถือ', spec: 'Thai female voice, age 30–40, confident warm and trustworthy tone, clear and steady' },
  { key: 'th_f_teen', label: 'หญิงไทย วัยรุ่น สดใสมีพลัง', spec: 'Thai female voice, late teens to early 20s, playful energetic Gen-Z tone, upbeat and lively' },
  { key: 'th_f_luxury', label: 'หญิงไทย หรูดูแพง (บิวตี้)', spec: 'Thai female voice, elegant refined premium beauty tone, smooth and soft-spoken, aspirational' },
  { key: 'th_f_whisper', label: 'หญิงไทย กระซิบ ASMR', spec: 'Thai female voice, very soft close-mic whisper ASMR tone, slow and intimate, breathy and gentle' },
  { key: 'th_f_live', label: 'หญิงไทย แม่ค้าไลฟ์ พลังล้น', spec: 'Thai female voice, lively enthusiastic live-selling energy, fast and persuasive, warm market-vendor charm' },
  { key: 'th_m_young', label: 'ชายไทย หนุ่ม เป็นกันเอง', spec: 'Thai male voice, age 20–30, friendly casual and upbeat tone, natural conversational pace' },
  { key: 'th_m_deep', label: 'ชายไทย เสียงทุ้ม น่าเชื่อถือ', spec: 'Thai male voice, age 30–40, deep calm and reassuring tone, clear and confident' },
  { key: 'th_m_hype', label: 'ชายไทย ไฮป์ ไลฟ์ขาย', spec: 'Thai male voice, high-energy hype live-seller tone, fast and exciting, persuasive' },
  { key: 'th_narrator_f', label: 'เสียงบรรยายหญิง (โทนเล่าเรื่อง)', spec: 'Thai female voice-over narrator, clear even and articulate, warm explainer documentary tone' },
  { key: 'th_narrator_m', label: 'เสียงบรรยายชาย (โทนเล่าเรื่อง)', spec: 'Thai male voice-over narrator, clear even and articulate, warm explainer documentary tone' },
];

export function getFlowVoice(key: string): FlowVoice | null {
  return FLOW_VOICES.find((v) => v.key === key) ?? null;
}
