// Reverse-capture step 1 — brief builder ต่อเครื่องมือ (client-side, ไม่เรียก AI ได้ผลทันที)
// ยังไม่มี character ในระบบ → สร้าง brief จาก seed idea + เทมเพลตเล็ก ๆ
// brief ทำ 2 อย่าง: (a) บรรยายให้ AI ค่ายนอก gen รูป (b) สั่งให้ปิดท้ายด้วย "สรุปตัวละคร"
//   ที่มีหัวข้อชัด → ผู้ใช้ก๊อปกลับมาวางใน step 3 ให้ Claude แตกเป็น draft ได้ริช ๆ
//
// policy-safe (กติกาเดียวกับ imagePrompt.ts v2):
//  - ChatGPT/Gemini: บรรยายภาษาอังกฤษล้วน ไม่มี "Negative prompt:" block,
//    ไม่มีข้อความ "avoid real people/celebrity/IP" (ตัวจุดชนวน content policy)
//  - นำหน้าด้วยเชื้อชาติเสมอ (default "Thai, Southeast Asian features") กัน Grok ออกมาเป็นฝรั่ง

export type CaptureTool = "chatgpt" | "gemini" | "grok";

export const DEFAULT_ETHNICITY = "Thai, Southeast Asian features";

export const CAPTURE_TOOLS: { id: CaptureTool; label: string; hint: string }[] = [
  { id: "chatgpt", label: "ChatGPT", hint: "วางแล้วสั่ง gen รูปได้เลย" },
  { id: "gemini", label: "Gemini", hint: "วางแล้วสั่ง gen รูปได้เลย" },
  { id: "grok", label: "Grok", hint: "รองรับ negative prompt + params" },
];

// หัวข้อสรุปที่อยากให้ AI ค่ายนอกปิดท้าย → ยิ่งริช ยิ่งแตก draft ได้แม่น
const SUMMARY_HEADINGS = "ชื่อ, บุคลิก, ใบหน้า, ผม, ผิว, จุดเด่น, สไตล์การแต่งตัว";

function summaryInstruction(): string {
  return [
    "",
    "เมื่อ gen รูปเสร็จแล้ว ช่วยสรุป \"ตัวละคร\" นี้เป็นหัวข้อภาษาไทยให้ครบ เพื่อนำไปใช้ต่อ:",
    `${SUMMARY_HEADINGS}`,
    "(เขียนเป็นหัวข้อ bullet สั้น ๆ อ่านง่าย เพื่อก๊อปไปใช้)",
  ].join("\n");
}

// core description ที่ทุกเครื่องมือใช้ร่วมกัน — นำด้วยเชื้อชาติเสมอ
function coreDescription(seed: string): string {
  const idea = seed.trim() || "an original Thai character for short-drama / live-commerce content";
  return `A photorealistic portrait of an original ${DEFAULT_ETHNICITY} character. Concept: ${idea}. Natural, believable Thai facial features; soft studio lighting; 3:4 vertical framing; high detail, sharp focus.`;
}

function buildChatGpt(seed: string): string {
  return [
    "ช่วยสร้างรูปตัวละครต้นฉบับตามคำบรรยายนี้ (เป็นภาพ portrait เหมือนถ่ายจริง):",
    "",
    coreDescription(seed),
    summaryInstruction(),
  ].join("\n");
}

function buildGemini(seed: string): string {
  return [
    "Generate a photorealistic portrait of an original character based on this description:",
    "",
    coreDescription(seed),
    summaryInstruction(),
  ].join("\n");
}

function buildGrok(seed: string): string {
  return [
    coreDescription(seed),
    "",
    "Negative prompt: deformed, extra fingers, bad anatomy, blurry, low quality, watermark, text",
    "Params: --ar 3:4",
    summaryInstruction(),
  ].join("\n");
}

// บล็อกรูปต้นแบบ — "เอาคล้าย ไม่เอาเหมือน" (ฝั่งปลอดภัย policy: สั่งให้ "ต่าง" จากรูป
// ไม่มีคำจุดชนวน celebrity/real people + เป็นเกราะเรื่องสิทธิ์บุคคลจริงในตัว)
const REFERENCE_PHOTO_BLOCK = [
  "",
  'ผมแนบ "รูปต้นแบบ" มาให้ 1 รูป — ใช้เป็นแรงบันดาลใจเท่านั้น:',
  "",
  "A reference photo is attached for INSPIRATION only. Create an ORIGINAL character with a SIMILAR overall impression — keep the general vibe, face-shape family, skin tone and styling direction close to the photo — but the final character must clearly be a DIFFERENT person: change several identifying features (eye shape, nose, lips, mole placement, hairline) so it does not reproduce the identity of the person in the photo.",
].join("\n");

// บล็อกรูปต้นฉบับ — "เอาเหมือนต้นฉบับ" (เฟรมเป็น "รูปทางการของตัวละคร" แบบเดียวกับ
// reference-lock ในระบบ — ปลอดภัยกว่าอ้างบุคคล และตรง use case จริง: มักเป็นรูป AI ที่ gen ไว้แล้วถูกใจ)
const REFERENCE_PHOTO_EXACT_BLOCK = [
  "",
  'ผมแนบ "รูปต้นฉบับของตัวละคร" มาให้ 1 รูป — นี่คือหน้าตาจริงของตัวละครตัวนี้:',
  "",
  "The attached image IS this character. Recreate the SAME person faithfully — identical face structure, eyes, nose, lips, skin tone, hairstyle and distinctive features. Do not redesign or alter the identity; follow the concept and styling below while keeping the face exactly consistent with the attached image.",
].join("\n");

export type CaptureReferenceMode = "none" | "similar" | "exact";

// กฎที่ตามติดตัวละคร (เติมเข้า visualDna.anti_clone_rules) — ต่างกันตามโหมดรูปต้นแบบ
export const REFERENCE_PHOTO_ANTI_CLONE_RULE =
  "ออกแบบจากรูปแรงบันดาลใจภายนอก — ห้ามปรับให้กลับไปเหมือนบุคคลจริงในรูปต้นแบบ";
export const REFERENCE_PHOTO_EXACT_RULE =
  "มีรูปต้นฉบับเป็น ground truth ของหน้าตา — ทุกการ gen ต้องยึดหน้าจากรูป reference เสมอ";

export function buildCaptureBrief(
  tool: CaptureTool,
  seed: string,
  opts: { referenceMode?: CaptureReferenceMode } = {},
): string {
  let brief: string;
  switch (tool) {
    case "gemini":
      brief = buildGemini(seed);
      break;
    case "grok":
      brief = buildGrok(seed);
      break;
    case "chatgpt":
    default:
      brief = buildChatGpt(seed);
  }
  const mode = opts.referenceMode ?? "none";
  if (mode === "none") return brief;
  const block = mode === "exact" ? REFERENCE_PHOTO_EXACT_BLOCK : REFERENCE_PHOTO_BLOCK;
  // แทรกบล็อกรูปต้นแบบก่อนคำสั่งสรุปท้าย brief — ให้ AI อ่านเจอก่อนเริ่ม gen
  const marker = "\nเมื่อ gen รูปเสร็จแล้ว";
  return brief.includes(marker) ? brief.replace(marker, `${block}\n${marker}`) : `${brief}${block}`;
}
