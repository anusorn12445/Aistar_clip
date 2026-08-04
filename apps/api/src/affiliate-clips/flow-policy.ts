// Flow Policy Guard — ตรวจจับถ้อยคำ/รูปแบบที่ Google Flow (Veo/Imagen) มักปฏิเสธด้วย content policy
// + auto-fix เขียนพรอมป์ใหม่ให้ผ่าน filter โดยคงความหมายเดิม (deterministic, ไม่เรียก AI)
//
// หลักการ: Flow เข้มเรื่อง (1) การสร้างบุคคลที่ระบุอายุ+เชื้อชาติเจาะจง (กัน deepfake/คนจริง)
// (2) close-up ใบหน้าคนเดี่ยวไม่มีบริบท (3) การเอ่ยคำ sensitive ซ้ำ ๆ
// ตัวนี้ทำงานกับ "พรอมป์ final" หลัง compose — ไม่แตะ logic การประกอบ

export interface PolicyFinding {
  id: string;
  severity: 'high' | 'medium' | 'low';
  label: string; // อธิบายภาษาไทยว่าเจออะไร
  hint: string; // แนะนำว่า auto-fix จะทำอะไร
}

export interface PolicyCheckResult {
  risk: 'high' | 'medium' | 'low' | 'none';
  findings: PolicyFinding[];
}

// ── กฎตรวจจับ (เรียงตามน้ำหนัก) ──
interface Rule {
  id: string;
  severity: PolicyFinding['severity'];
  test: RegExp;
  label: string;
  hint: string;
}

const RULES: Rule[] = [
  {
    id: 'explicit_age',
    severity: 'high',
    test: /\b\d{1,2}[-\s]?year[-\s]?old\b/i,
    label: 'ระบุอายุเจาะจง (เช่น 28-year-old) — Flow เข้มกับการสร้างคนที่ระบุอายุ',
    hint: 'เปลี่ยนเป็นช่วงวัยกว้าง ๆ (young / in her twenties)',
  },
  {
    id: 'ethnicity_repeat',
    severity: 'high',
    test: /(ethnicity|southeast asian features)/i,
    label: 'ระบุเชื้อชาติเชิงป้ายกำกับ/ซ้ำ (ethnicity:, Southeast Asian features)',
    hint: 'เหลือการบรรยายสัญชาติแบบธรรมชาติครั้งเดียว (a Thai woman)',
  },
  {
    id: 'ethnicity_label_thai',
    severity: 'high',
    test: /(ลักษณะเอเชียตะวันออกเฉียงใต้|เชื้อชาติ\s*[:：])/,
    label: 'ป้ายเชื้อชาติภาษาไทย (ลักษณะเอเชียตะวันออกเฉียงใต้) — trigger เดียวกับเวอร์ชันอังกฤษ',
    hint: 'แปลงเป็น "Thai" ธรรมชาติครั้งเดียว',
  },
  {
    id: 'mixed_thai_attributes',
    severity: 'medium',
    test: /\b(young|a)\s+ไทย\b|with\s+[\u0E00-\u0E7F]+\s+skin/,
    label: 'ไทยปนอังกฤษกลางประโยคบรรยายตัวตน — โมเดลภาพอ่านสับสนและ classifier เสี่ยงบล็อก',
    hint: 'แปลงคำหลักเป็นอังกฤษให้ประโยคไหลภาษาเดียว',
  },
  {
    id: 'negation_heavy_hidden',
    severity: 'medium',
    test: /Do NOT show (the|any) product/i,
    label: 'ประโยคซ่อนสินค้าแบบปฏิเสธหนัก (no product, no packaging...) — ภาพคนเดี่ยว+คำห้ามซ้ำ เสี่ยงโดน filter',
    hint: 'แปลงเป็นประโยคเชิงบวก (a simple everyday lifestyle scene)',
  },
  {
    id: 'identity_lock',
    severity: 'medium',
    test: /(keep these exact features consistent|same person as specified|reproduce this exact|identity lock)/i,
    label: 'ภาษา identity-lock แรง — Flow อาจตีความว่าพยายามทำซ้ำบุคคลจริง',
    hint: 'เปลี่ยนเป็นภาษาบรรยายความต่อเนื่องแบบนุ่ม (consistent look)',
  },
  {
    id: 'closeup_person',
    severity: 'medium',
    test: /(?<!medium[-\s])\bclose[-\s]?up\b/i, // medium close-up = ปลอดภัยแล้ว ไม่ฟ้องซ้ำ
    label: 'close-up ใบหน้าคนเดี่ยว — บางครั้งทริกเกอร์ filter',
    hint: 'เปลี่ยนเป็น medium close-up / medium shot',
  },
  {
    id: 'bare_person_focus',
    severity: 'low',
    test: /focus on the person\/scene only/i,
    label: 'เฟรมคนเดี่ยวไม่มีบริบทช่วยให้ดูปลอดภัย',
    hint: 'เพิ่มบริบทฉากในบ้าน (in a casual home setting)',
  },
];

export function checkFlowPolicy(prompt: string): PolicyCheckResult {
  const findings: PolicyFinding[] = [];
  for (const r of RULES) {
    if (r.test.test(prompt)) {
      findings.push({ id: r.id, severity: r.severity, label: r.label, hint: r.hint });
    }
  }
  const risk =
    findings.some((f) => f.severity === 'high')
      ? 'high'
      : findings.some((f) => f.severity === 'medium')
        ? 'medium'
        : findings.length > 0
          ? 'low'
          : 'none';
  return { risk, findings };
}

// ── Auto-fix: rewrite พรอมป์ให้ผ่าน filter โดยคงความหมาย ──
export function autoFixFlowPolicy(prompt: string): string {
  let out = prompt;

  // 1) อายุเจาะจง → ช่วงวัย
  out = out.replace(/\ba\s+\d{1,2}[-\s]?year[-\s]?old\b/gi, 'a young');
  out = out.replace(/\b\d{1,2}[-\s]?year[-\s]?old\b/gi, 'young');

  // 1.5) ป้ายเชื้อชาติ/คำปนภาษาไทย → อังกฤษธรรมชาติ
  out = out.replace(/ไทย,\s*ลักษณะเอเชียตะวันออกเฉียงใต้/g, 'Thai');
  out = out.replace(/,?\s*ลักษณะเอเชียตะวันออกเฉียงใต้/g, '');
  out = out.replace(/เชื้อชาติ\s*[:：]\s*/g, '');
  out = out.replace(/\b(a|A) young ไทย\b/g, '$1 young Thai');
  out = out.replace(/\byoung ไทย\b/g, 'young Thai');
  out = out.replace(/with ขาวเหลือง skin/g, 'with warm fair skin');
  out = out.replace(/with ขาว skin/g, 'with fair skin');

  // 2) ethnicity label + ซ้ำ → บรรยายธรรมชาติครั้งเดียว
  //    "Thai, Southeast Asian features woman" → "Thai woman"
  out = out.replace(/Thai,\s*Southeast Asian features\s+woman/gi, 'Thai woman');
  out = out.replace(/Thai,\s*Southeast Asian features\s+man/gi, 'Thai man');
  //    บรรทัด "Keep these exact features consistent: ethnicity: ...; ..." → นุ่มลง ตัด ethnicity label
  out = out.replace(
    /Keep these exact features consistent:[^\n]*/gi,
    'Keep a consistent, natural look for this person across shots.',
  );
  //    เศษ "ethnicity: Thai, Southeast Asian features" ที่หลงเหลือ (MUST-KEEP line เดิม)
  out = out.replace(/ethnicity:\s*Thai,\s*Southeast Asian features\.?/gi, '');
  out = out.replace(/,?\s*Southeast Asian features/gi, '');
  out = out.replace(/ethnicity:\s*/gi, '');

  // 2.5) ประโยคซ่อนสินค้าแบบปฏิเสธหนัก → เชิงบวกสั้น (product เหลือครั้งเดียว ที่เหลือให้ AVOID จัดการ)
  out = out.replace(
    /Do NOT show the product in this shot[^\n]*/gi,
    'A simple everyday lifestyle scene — just her, her story, and the room around her.',
  );
  out = out.replace(
    /Important: Do NOT show any product[^\n]*/gi,
    'The whole clip stays a simple everyday lifestyle scene — only her and the room.',
  );
  out = out.replace(/Do NOT show (the|any) product[^\n]*/gi, 'A simple everyday lifestyle scene.');

  // 3) identity-lock แรง → นุ่ม
  out = out.replace(
    /Same person as specified above,\s*/gi,
    'The same natural-looking person, ',
  );

  // 4) close-up → medium close-up (ครั้งเดียว ไม่ซ้อน medium)
  out = out.replace(/\bclose[-\s]?up framing\b/gi, 'medium close-up framing');
  out = out.replace(/\bcloseup framing\b/gi, 'medium close-up framing');
  out = out.replace(/(?<!medium\s)\bclose[-\s]?up\b/gi, 'medium close-up');
  out = out.replace(/medium medium close-up/gi, 'medium close-up');

  // 5) เฟรมคนเดี่ยว → เพิ่มบริบทบ้าน
  out = out.replace(
    /Focus on the person\/scene only\./gi,
    'Focus on the person in a casual, natural home setting.',
  );

  // เก็บกวาด: ช่องว่างซ้ำ / จุลภาคลอย / บรรทัดว่างซ้อน
  out = out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .trim();

  return out;
}
