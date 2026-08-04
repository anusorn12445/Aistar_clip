// UGC Studio v2 — Review Recipes (code-level data, เฟส 2 ค่อยย้ายไป Settings-managed)
// สูตรรีวิวต่อ "ประเภทตัวถูกรีวิว + หมวด" — ป้อนเข้า prompt วางแผนของ Claude
// (sceneFlow = ลำดับการเล่าภาษาไทย + จุดเน้น, promptEmphasis = photo/video cues ภาษาอังกฤษ)

export type SubjectType = 'product' | 'place' | 'food' | 'software';

export interface RecipeSection {
  name: string; // ชื่อช่วงภาษาไทย เช่น "แกะกล่อง", "เปิดประตูห้อง"
  note?: string; // จุดเน้นของช่วงนี้ (ป้อนเข้า prompt)
}

export interface ReviewRecipe {
  key: string; // `${subjectType}/${category}`
  label: string;
  sceneFlow: RecipeSection[];
  promptEmphasis: string[]; // EN photo cues — ผนวกเข้า stillPrompt ทุกฉาก (เฉพาะภาพนิ่ง)
  promptEmphasisVideo?: string[]; // EN video cues — ผนวกเข้า motionPrompt ทุกฉาก (เฉพาะวิดีโอ — ไม่ตั้ง = ไม่ใส่)
  negativeStill?: string[]; // ปิดท้าย stillPrompt เสมอ (AVOID: ...) — ไม่ตั้ง = ใช้ default กลาง
  negativeVideo?: string[]; // ปิดท้าย motionPrompt เสมอ (AVOID: ...) — ไม่ตั้ง = ใช้ default กลาง
  ctaDefault: string; // basket | map | line | phone | booking
}

export const PLACE_CATEGORIES = ['cafe', 'bakery', 'restaurant-noodle', 'hotel'] as const;
export const FOOD_CATEGORIES = ['menu'] as const;
export const SOFTWARE_CATEGORIES = ['feature'] as const; // v2.1 — รีวิวซอฟต์แวร์/ฟีเจอร์ (เช่น GoSell)
export const CTA_TYPES = ['basket', 'map', 'line', 'phone', 'booking', 'signup'] as const;

// CTA ปิดคลิปต่อประเภท — ใช้ทั้งใน prompt วางแผน + package panel
export const CTA_CLOSING: Record<string, string> = {
  basket: 'จิ้มตะกร้าเลย',
  map: 'พิกัดในคอมเมนต์',
  line: 'ทัก LINE สั่งได้เลย',
  phone: 'โทรสั่ง/โทรจองได้เลย',
  booking: 'จองเลย ลิงก์ในคอมเมนต์',
  signup: 'สมัครฟรี/ทดลองใช้เลย ลิงก์ในคอมเมนต์/ไบโอ',
};

export const REVIEW_RECIPES: Record<string, ReviewRecipe> = {
  'product/general': {
    key: 'product/general',
    label: 'สินค้าทั่วไป — แกะกล่องถึงผลลัพธ์',
    sceneFlow: [
      { name: 'เปิดหัวดึงคนดู', note: 'hook 3 วิแรก หยุดนิ้วคนเลื่อน' },
      { name: 'แกะกล่อง', note: 'เห็นของจริงครบ ในกล่องมีอะไรบ้าง' },
      { name: 'โชว์ตัวสินค้า', note: 'ดีไซน์/ป้ายฉลากชัด สินค้าเป็นพระเอก' },
      { name: 'ใช้งานจริง', note: 'สาธิตการใช้แบบคนใช้จริง ไม่ใช่โฆษณา' },
      { name: 'ผลลัพธ์', note: 'ผลที่จับต้องได้ ไม่เคลมเกินจริง' },
      { name: 'ปิดขาย CTA', note: 'ชวนกดชัดเจน ไม่กำกวม' },
    ],
    promptEmphasis: [
      'authentic customer-photo feel',
      'product label clearly legible, product is the hero',
      'warm home lighting',
    ],
    ctaDefault: 'basket',
  },
  'product/beauty': {
    key: 'product/beauty',
    label: 'บิวตี้/สกินแคร์ — เนื้อสัมผัส/วิธีใช้/ฟีลหลังใช้',
    sceneFlow: [
      { name: 'เปิดหัวปัญหาผิว', note: 'ตั้งปัญหาที่กลุ่มเป้าหมายเจอจริง' },
      { name: 'โชว์แพ็กเกจ', note: 'แบรนด์/ฉลากชัด' },
      { name: 'เนื้อสัมผัส', note: 'texture close-up — เนื้อครีม/เซรั่มบนหลังมือ' },
      { name: 'วิธีใช้', note: 'ขั้นตอนการทา/ใช้จริง' },
      { name: 'ฟีลหลังใช้', note: 'ความรู้สึกหลังใช้ — ห้ามเคลมผลลัพธ์ทางการแพทย์' },
      { name: 'ปิดขาย CTA' },
    ],
    promptEmphasis: [
      'macro texture close-up, creamy swatch detail',
      'soft beauty lighting, clean skin tones',
      'product label clearly legible',
    ],
    ctaDefault: 'basket',
  },
  'product/toothpaste': {
    key: 'product/toothpaste',
    label: '🪥 ขายยาสีฟัน — ปากสะอาด ยิ้มมั่นใจ',
    sceneFlow: [
      { name: 'เปิดหัวปัญหาปาก', note: 'hook ความไม่มั่นใจที่คนเจอจริง — กลิ่นปาก/คราบชา-กาแฟ/ไม่กล้ายิ้ม ท่าเอามือป้องปาก สีหน้าอ่านง่าย' },
      { name: 'โชว์หลอด', note: 'หลอดปิดสนิท ฉลาก+แถบสีหันกล้องชัด สินค้าเป็นพระเอก' },
      { name: 'บีบเนื้อยา', note: 'ซิกเนเจอร์ของหมวด: บีบเป็นแถบเรียบบนขนแปรง เห็นเนื้อ/แถบสีโคลสอัป' },
      { name: 'แปรงจริง', note: 'แปรงฟันหน้าวนเบาๆ ฟองนิดเดียวดูสดชื่น สีหน้าผ่อนคลาย ไม่ใช่โฆษณาเวอร์' },
      { name: 'ยิ้มมั่นใจ', note: 'ผลที่จับต้องได้: ยิ้มกว้างฟันดูสะอาด ลมหายใจสดชื่นมั่นใจ — ห้ามเคลมผลทางการแพทย์/ฟันขาวขึ้นกี่เฉด' },
      { name: 'ปิดขาย CTA', note: 'ถือหลอดระดับอกฉลากหันกล้อง อีกมือชี้ตะกร้า ยิ้มสดใส' },
    ],
    promptEmphasis: [
      'fresh clean bathroom-sink setting, bright airy morning light',
      'toothpaste tube label clearly legible, stripe colors true to the reference',
      'a neat even ribbon of toothpaste on the brush, confident clean smile',
    ],
    promptEmphasisVideo: [
      'a neat even ribbon of toothpaste squeezed onto the bristles',
      'a hint of fresh light foam, never excessive',
      'bright confident smile showing clean natural teeth',
    ],
    negativeStill: [
      'excessive foam covering the mouth or chin',
      'foam turning grey, yellow or dirty looking',
      'toothpaste ribbon melting or sliding off the brush',
      'toothpaste changing color or stripe pattern',
      'teeth looking yellow, stained, crooked or damaged',
      'distorted mouth or extra teeth',
      'label text misspelled or rewritten',
      'toothbrush bending or melting',
      'messy paste smeared on the face',
      'watermark, text overlay',
    ],
    negativeVideo: [
      'morphing faces or objects between frames',
      'flickering, frame jitter, ghosting trails',
      'extra fingers appearing during motion',
      'lip-sync drifting from the audio',
      'watermark, subtitles burned into the video',
      'hard cuts or camera angle changes mid-clip',
      'scene switching or jump cuts to a different shot',
      'flash frames, white flashes or strobing between frames',
      'montage editing, multiple scenes stitched together',
      'camera suddenly repositioning or snapping to a new angle',
      'label text changing or melting mid-clip',
      'product changing shape, color, size or design mid-clip',
      'toothpaste changing color or stripe pattern mid-clip',
      'tube squeezing out endless paste like an overflow',
      'paste ribbon melting, drooping or sliding off the brush',
      'product being swapped for a different item',
      'excessive foam filling the mouth or dripping down the chin',
      'foam turning grey, yellow or dirty looking',
      'toothbrush bending, melting or changing shape',
      'teeth looking yellow, stained or damaged',
      'mouth or teeth deforming while brushing',
      "character's face changing into a different person mid-clip",
      'spoken words differing from the scripted line',
      'improvised, paraphrased or reworded dialogue',
    ],
    ctaDefault: 'basket',
  },
  'product/gadget': {
    key: 'product/gadget',
    label: 'แกดเจ็ต — ฟังก์ชัน/ใช้จริง',
    sceneFlow: [
      { name: 'เปิดหัวฟีเจอร์เด็ด', note: 'ชูจุดขายเดียวที่ว้าวสุด' },
      { name: 'แกะกล่อง/อุปกรณ์ในชุด' },
      { name: 'ฟังก์ชันหลัก', note: 'กดใช้ให้เห็นจริงทีละฟังก์ชัน' },
      { name: 'ใช้จริงในชีวิตประจำวัน', note: 'สถานการณ์จริงที่คนดูเห็นภาพ' },
      { name: 'สรุปคุ้มไหม' },
      { name: 'ปิดขาย CTA' },
    ],
    promptEmphasis: [
      'clean tech product shots, function in action',
      'hands operating buttons/screen naturally',
      'crisp detail, no motion blur on product',
    ],
    ctaDefault: 'basket',
  },
  'place/cafe': {
    key: 'place/cafe',
    label: 'คาเฟ่ — เดินเข้าร้านถึงพิกัด',
    sceneFlow: [
      { name: 'เดินเข้าร้าน', note: 'หน้าร้าน/ป้ายร้าน เห็นบรรยากาศแวบแรก' },
      { name: 'บรรยากาศในร้าน', note: 'มุมกว้าง โทนร้าน ที่นั่ง' },
      { name: 'สั่งเครื่องดื่ม/เมนู', note: 'เคาน์เตอร์/เมนูเด่นของร้าน' },
      { name: 'ลาเต้อาร์ต/เมนูซิกเนเจอร์', note: 'close-up งานสวยของร้าน' },
      { name: 'ชิม', note: 'รีแอ็กชันจริงใจ' },
      { name: 'มุมถ่ายรูป', note: 'มุมที่คนมาต้องถ่าย' },
      { name: 'พิกัด/CTA', note: 'ที่อยู่ เวลาเปิด ราคา' },
    ],
    promptEmphasis: [
      'cozy cafe ambience, natural window light',
      'latte art close-up, steam over the cup',
      'instagrammable corner, real place look',
    ],
    ctaDefault: 'map',
  },
  'place/bakery': {
    key: 'place/bakery',
    label: 'เบเกอรี่ — หน้าตู้ขนมถึงพิกัด',
    sceneFlow: [
      { name: 'เปิดหัวหน้าตู้ขนม', note: 'ตู้ขนมเต็ม ๆ ดึงสายหวาน' },
      { name: 'เลือกขนม', note: 'ชี้/คีบขนมเด่นของร้าน' },
      { name: 'ฉีกครัวซองต์', note: 'shot ฮีโร่ — ชั้นแป้ง/ความกรอบ' },
      { name: 'ชิม', note: 'รีแอ็กชันจริงใจ + บอกรสชาติ' },
      { name: 'พิกัด/CTA', note: 'ที่อยู่ เวลาเปิด ราคาเริ่มต้น' },
    ],
    promptEmphasis: [
      'golden flaky croissant layers, tear-apart shot',
      'pastry display case full of baked goods',
      'warm bakery lighting, appetizing detail',
    ],
    ctaDefault: 'map',
  },
  'place/restaurant-noodle': {
    key: 'place/restaurant-noodle',
    label: 'ร้านก๋วยเตี๋ยว/อาหารตามสั่ง — หน้าร้านถึงพิกัด',
    sceneFlow: [
      { name: 'หน้าร้าน', note: 'ป้ายร้าน/คิวลูกค้า ความน่าเชื่อ' },
      { name: 'ควันหม้อ', note: 'หม้อน้ำซุปเดือด ควันลอย' },
      { name: 'ลวกเส้น', note: 'จังหวะลวก/สะบัดเส้นของแม่ค้า' },
      { name: 'เสิร์ฟ', note: 'ชามเต็ม ๆ ท็อปปิ้งครบ' },
      { name: 'ซด', note: 'ซดน้ำซุป/ดูดเส้น รีแอ็กชันจริง' },
      { name: 'พิกัด/CTA', note: 'ที่อยู่ เวลาเปิด ราคา' },
    ],
    promptEmphasis: [
      'steam rising from boiling broth pot',
      'noodles being blanched, street-food energy',
      'full bowl close-up, glossy soup, appetizing',
    ],
    ctaDefault: 'map',
  },
  'place/hotel': {
    key: 'place/hotel',
    label: 'ที่พัก/โรงแรม — เปิดหัวราคาถึง CTA จอง',
    sceneFlow: [
      { name: 'เปิดหัวราคา', note: 'ราคาคืนละเท่าไหร่ ชูความคุ้มตั้งแต่วิแรก' },
      { name: 'ล็อบบี้', note: 'first impression ของโรงแรม' },
      { name: 'เปิดประตูห้อง', note: 'moment เปิดประตู — wide room reveal ต้องว้าว' },
      { name: 'ทัวร์ห้อง/เตียง/วิว', note: 'เตียง ผ้าปู วิวหน้าต่าง' },
      { name: 'ห้องน้ำ/amenity', note: 'ความสะอาด ของใช้ที่ให้' },
      { name: 'สระ/อาหารเช้า', note: 'facility เด่นที่รวมในราคา' },
      { name: 'สรุปคุ้ม', note: 'คุ้มไหมกับราคานี้ ตอบตรง ๆ' },
      { name: 'CTA จอง', note: 'จองเลย + ลิงก์' },
    ],
    promptEmphasis: [
      'wide room reveal from the doorway',
      'window view from inside the room',
      'crisp white bedding close-up, hotel-clean look',
    ],
    ctaDefault: 'booking',
  },
  // v2.1 — รีวิวซอฟต์แวร์/ฟีเจอร์ SaaS (เช่น GoSell back-office)
  // ⚠️ ฉากหน้าจอ (sceneType=screen) ห้าม AI gen UI — ใช้ "ใบสั่ง Capture" ให้ทีมอัด screen record จริง
  // ฉากคน/มือ/บรรยากาศยัง AI gen ตามปกติ แต่จอในเฟรมต้องเบลอ/เอียง อ่านไม่ออก
  'software/feature': {
    key: 'software/feature',
    label: 'ซอฟต์แวร์/ฟีเจอร์ — เปิด pain ถึง CTA สมัคร',
    sceneFlow: [
      { name: '😩 เปิด pain', note: 'ปัญหาที่แม่ค้า/คนทำงานเจอจริง — hook 3 วิแรก' },
      { name: '🎭 แนะนำตัวช่วย', note: 'presenter/hands แนะนำฟีเจอร์ที่แก้ปัญหานี้' },
      { name: '🖥️ เดโมหน้าจอ step 1-3', note: 'ฉาก screen — capture หน้าจอจริงตามขั้นตอนใน brief (ห้าม AI gen UI)' },
      { name: '📊 ผลลัพธ์/ตัวเลข', note: 'ตัวเลขจับต้องได้ — screen หรือ presenter เล่าผล' },
      { name: '🎭 สรุปคุ้ม', note: 'ตอบตรง ๆ ว่าคุ้มไหม เหมาะกับใคร' },
      { name: '🔗 CTA สมัคร', note: 'ชวนสมัครฟรี/ทดลองใช้ + ลิงก์' },
    ],
    promptEmphasis: [
      'modern Thai online seller, laptop/phone in use',
      'screen content NOT readable (blurred or angled)',
      'office/home-office setting, authentic workflow feel',
    ],
    ctaDefault: 'signup',
  },
  'food/menu': {
    key: 'food/menu',
    label: 'อาหาร/เมนู — เสิร์ฟร้อนถึงราคา/พิกัด',
    sceneFlow: [
      { name: 'เสิร์ฟร้อน', note: 'จานมาถึงโต๊ะ ควันยังลอย' },
      { name: 'ควันลอย', note: 'close-up ควัน/ความร้อนของจาน' },
      { name: 'เนื้อสัมผัส close-up', note: 'macro จุดขายของเมนู' },
      { name: 'ตัก/ยืดชีส/ซด', note: 'จังหวะฮีโร่ — ตักคำแรก ชีสยืด หรือซดน้ำซุป' },
      { name: 'ชิม + รีแอ็กชัน', note: 'บอกรสชาติแบบคนกินจริง' },
      { name: 'ราคา/พิกัด CTA', note: 'ราคา + ร้านอยู่ไหน' },
    ],
    promptEmphasis: [
      'steam rising, glossy sauce',
      'cheese pull, macro food shot',
      'appetizing, vibrant natural food colors',
    ],
    ctaDefault: 'map',
  },

  // ── รูปแบบคลิปเพิ่มเติม (เลือกต่อ job ได้ — ไม่ผูกกับหมวดสินค้า) ──
  'product/unbox': {
    key: 'product/unbox',
    label: 'เปิดกล่อง (Unbox) — ประสบการณ์แกะครั้งแรก',
    sceneFlow: [
      { name: 'กล่องมาส่งถึงมือ', note: 'hook — ความตื่นเต้นของแรกเจอ พัสดุ/กล่องแบรนด์เต็มเฟรม' },
      { name: 'แกะกล่องชั้นแรก', note: 'เปิดฝา ดึงกันกระแทก — first reaction จริง ไม่เหมือนซ้อมมา' },
      { name: 'เจอตัวสินค้า + สำรวจรอบตัว', note: 'ยกออกมา หมุนดูรอบด้าน ดีเทลผิว/ฉลาก/อุปกรณ์ที่แถม' },
      { name: 'ลองใช้ครั้งแรก + ปิดการขาย', note: 'ทดลองสั้น ๆ + ความรู้สึกแรก + CTA' },
    ],
    promptEmphasis: [
      'top-down and eye-level unboxing shots on a clean table',
      'shipping box and wrapping stay part of the story',
      'genuine first-reaction energy, natural daylight',
    ],
    ctaDefault: 'basket',
  },
  'product/asmr': {
    key: 'product/asmr',
    label: 'ASMR — เสียงคือพระเอก',
    sceneFlow: [
      { name: 'เสียงแรกสะกดหู', note: 'hook — เสียงแกะ/เคาะ/บีบชัด ๆ ก่อนเห็นอะไรเต็มตัว' },
      { name: 'สัมผัสพื้นผิว', note: 'macro เนื้อสัมผัส + เสียงเสียดสี/กด/หมุนฝา' },
      { name: 'ใช้งานช้า ๆ เต็มกลไก', note: 'pump/บีบ/สเปรย์ตามกลไกจริง เสียง mechanism เด่น' },
      { name: 'ผลลัพธ์เนียนตา + ปิดเบา ๆ', note: 'ภาพผลลัพธ์ satisfying + CTA กระซิบสั้น' },
    ],
    promptEmphasis: [
      'macro close-ups, shallow depth of field, texture-rich frames',
      'slow deliberate motion, soft warm light, minimal ambient noise',
      'mechanism sounds (pump click, squeeze, cap twist) clean and prominent',
    ],
    ctaDefault: 'basket',
  },
  'product/tutorial': {
    key: 'product/tutorial',
    label: 'สอนใช้งาน (How-to) — เซฟไว้ทำตาม',
    sceneFlow: [
      { name: 'ปัญหาที่หลายคนทำผิด', note: 'hook — "ใช้แบบนี้อยู่หรือเปล่า" ชวนเอ๊ะ' },
      { name: 'แนะนำตัวช่วย + ภาพรวมขั้นตอน', note: 'เผยสินค้า + บอกว่ามีกี่ step' },
      { name: 'ทำตามทีละขั้นชัด ๆ', note: 'demonstration เห็นมือ+ของชัด ไม่รีบ' },
      { name: 'ผลลัพธ์ + ชวนเซฟ/ซื้อ', note: 'before-after สั้น + CTA' },
    ],
    promptEmphasis: [
      'clean uncluttered background, even flattering lighting',
      'demonstration-friendly framing, hands and product clearly readable',
      'confident mentor energy, save-this-clip vibe',
    ],
    ctaDefault: 'basket',
  },
  'product/baftertest': {
    key: 'product/baftertest',
    label: 'ก่อน/หลัง (Before-After) — เล่าจากผลจริง',
    sceneFlow: [
      { name: 'เล่าปัญหาในอดีต', note: 'hook — testimonial จริงใจ เล่าด้วยปาก ไม่ render สภาพแย่บนตัว' },
      { name: 'จุดเปลี่ยน — เจอตัวนี้', note: 'เผยสินค้า + เหตุผลที่ลอง' },
      { name: 'ผลลัพธ์ปัจจุบันที่เห็นได้', note: 'โชว์สภาพตอนนี้ believable ไม่ CGI-perfect' },
      { name: 'สรุปความเปลี่ยนแปลง + ชวนลอง', note: 'ความรู้สึก + CTA' },
    ],
    promptEmphasis: [
      'warm natural daylight, direct-to-camera testimonial framing',
      'sincere grateful tone, credible visible result',
      'presenter shown in current improved state only',
    ],
    ctaDefault: 'basket',
  },
  'product/live': {
    key: 'product/live',
    label: 'ไลฟ์ขาย (Live-sell) — พลังแม่ค้าไลฟ์',
    sceneFlow: [
      { name: 'ทักคนดูดึงเข้าไลฟ์', note: 'hook — พลังสูง "ทุกคนนน ตัวนี้ต้องดู"' },
      { name: 'โชว์สินค้าติดมือ', note: 'ยกของชูเข้ากล้อง ชี้จุดเด่นเร็ว ๆ' },
      { name: 'สาธิตสด + ตอบข้อสงสัยยอดฮิต', note: 'ลองให้ดูจริง + เคลียร์คำถามที่คนถามบ่อย' },
      { name: 'ปิดดีลด้วยโปร', note: 'ย้ำราคา/โปร + CTA เร่งตัดสินใจแบบไม่กดดันเกิน' },
    ],
    promptEmphasis: [
      'Thai livestream setup, warm ring-light, product-forward framing',
      'presenter talks to audience continuously, bright engaging energy',
      'human warmth, no shouting, no chaos',
    ],
    ctaDefault: 'basket',
  },
};

// ── รูปแบบคลิปสินค้าที่เลือกได้ต่อ job (นอกเหนือ auto ตามหมวดสินค้า) ──
// ── Negative กลาง (ใช้เมื่อสูตรไม่ได้ตั้งของตัวเอง) — แก้รายสูตรได้ที่หน้า สูตรคลิป ──
export const UGC_NEGATIVE_STILL_DEFAULT: string[] = [
  'distorted or invented label text, misspelled text, warped logo',
  'extra fingers, deformed hands',
  'warped or duplicated product, melted shapes',
  'over-smoothed plastic skin',
  'studio backdrop, ring-light reflection',
  'watermark, caption text, UI overlay',
  'oversaturated HDR colors',
  'blurry, out of focus, CGI look',
  // 🖐 ล็อกจำนวนมือ — ห้ามเกิน 2 มือในทุกภาพ
  'more than two hands in the frame',
  'a second pair of hands, a third hand',
  "someone else's hands entering the frame",
  'disembodied hands or arms',
];
export const UGC_NEGATIVE_VIDEO_DEFAULT: string[] = [
  'morphing faces or objects between frames',
  'flickering, frame jitter, ghosting trails',
  'label text changing or melting mid-clip',
  'extra fingers appearing during motion',
  // 🖐 ล็อกจำนวนมือ — ห้ามเกิน 2 มือตลอดคลิป
  'more than two hands visible at any moment',
  'a third hand appearing during motion, extra pair of hands',
  "someone else's hands reaching into the frame",
  'disembodied hands or arms entering from the frame edge',
  'product warping, stretching or duplicating while moving',
  'sudden teleporting cuts, unnatural sliding motion',
  'lip-sync drifting from the audio',
  'watermark, subtitles burned into the video',
];

export const PRODUCT_FORMAT_KEYS = [
  'product/general', 'product/beauty', 'product/gadget',
  'product/unbox', 'product/asmr', 'product/tutorial', 'product/baftertest', 'product/live',
] as const;

/** map หมวดสินค้าใน catalog → recipe หมวดสินค้า (beauty/gadget/general) */
export function productRecipeCategory(productCategory: string | null | undefined): string {
  const c = (productCategory ?? '').toLowerCase();
  // 🪥 ยาสีฟัน/ช่องปาก → สูตรเฉพาะทันที
  if (['ยาสีฟัน', 'toothpaste', 'ช่องปาก', 'oral'].some((k) => c.includes(k))) return 'toothpaste';
  if (['beauty', 'skincare', 'cosmetic', 'cosmetics'].some((k) => c.includes(k))) return 'beauty';
  if (['gadget', 'electronic', 'electronics', 'tech', 'it'].some((k) => c.includes(k))) return 'gadget';
  return 'general';
}

/** หา recipe จาก subjectType + category — ไม่เจอ fallback product/general (กันพัง ไม่ throw)
 *  recipes: ส่ง map ที่ merge overrides จาก Settings แล้วได้ (default = ตัว built-in ในไฟล์นี้)
 *  product: category ที่เป็น format key ตรง ๆ (unbox/asmr/...) ใช้ก่อน — ไม่ใช่ค่อย map จากหมวดสินค้า */
export function resolveRecipe(
  subjectType: string,
  category: string | null | undefined,
  recipes: Record<string, ReviewRecipe> = REVIEW_RECIPES,
): ReviewRecipe {
  if (subjectType === 'product') {
    const direct = category ? recipes[`product/${category}`] : undefined;
    if (direct) return direct;
    return recipes[`product/${productRecipeCategory(category)}`] ?? recipes['product/general'] ?? REVIEW_RECIPES['product/general'];
  }
  if (subjectType === 'food') return recipes['food/menu'] ?? REVIEW_RECIPES['food/menu'];
  if (subjectType === 'software') return recipes['software/feature'] ?? REVIEW_RECIPES['software/feature'];
  const key = `place/${category ?? ''}`;
  return recipes[key] ?? recipes['place/cafe'] ?? REVIEW_RECIPES['place/cafe'];
}

/** จำนวนฉากตามความยาวเป้าหมาย (วิ) — ป้อนเข้า prompt วางแผน
 *  v3: ฉากละ 8 วิตายตัว (= บล็อกเจนธรรมชาติของ Veo) → จำนวนฉาก = duration/8 เป๊ะๆ (8 วิ = 1 ฉาก, 16 วิ = 2 ฉาก)
 *  สคริปต์ต้องเล่าจบ (มี CTA ปิด) ภายในจำนวนฉากนี้พอดี */
export function sceneCountGuidance(
  targetDurationSec: number | null | undefined,
  sceneLenSec = 8, // ⏱ ความยาวต่อฉาก (4/6/8 เลือกตอนสร้าง job)
): { min: number; max: number } {
  const d = targetDurationSec ?? 16;
  const len = [4, 6, 8].includes(sceneLenSec) ? sceneLenSec : 8;
  const n = Math.max(1, Math.round(d / len));
  return { min: n, max: n };
}
