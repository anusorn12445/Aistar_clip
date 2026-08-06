// พรอมประเภทสินค้า (Product Type Prompts) — "สินค้านี้คืออะไร + ใช้ยังไง" (ยาสีฟัน/สบู่/โฟมล้างหน้า ...)
// แยกจาก:
//   ประเภทบรรจุภัณฑ์ (packaging-prompts) = ภาชนะ/ฝา (ขวด/หลอด/ปั๊ม/ฝาเกลียว ...)
//   เนื้อสัมผัส (texture-prompts) = เนื้อของตัวสินค้า (เจล/ครีม/โฟม ...)
// ผูกกับ Product.productType → ฉีดเป็น "แอ็กชันใช้งานหลัก" ก่อน packaging+texture (ทำงานก่อน)
// override ผ่านหน้า สูตรคลิป แท็บ "ประเภทสินค้า" (SystemSetting key 'ugc.producttype.overrides')

export interface ProductTypePrompt {
  key: string;
  label: string; // ป้ายไทยตรงกับ dropdown
  promptStill: string; // EN — บริบทการใช้งานในภาพนิ่ง
  promptVideo: string; // EN — แอ็กชันใช้งานจริงของสินค้าชนิดนี้
  negative: string;
}

export function productTypeStill(p: ProductTypePrompt): string {
  return (p.promptStill ?? '').trim();
}
export function productTypeVideo(p: ProductTypePrompt): string {
  return (p.promptVideo ?? '').trim();
}

export const PRODUCT_TYPE_PROMPTS: Record<string, ProductTypePrompt> = {
  toothpaste: {
    key: 'toothpaste',
    label: 'ยาสีฟัน',
    promptStill:
      'An oral-care product used for brushing teeth — shown with a toothbrush nearby, a small ribbon of paste ready on the bristles.',
    promptVideo:
      'a ribbon of toothpaste is applied along the toothbrush bristles, then used to brush the teeth in front of a mirror, working up a light minty foam.',
    negative: 'eating the paste, paste on food, brushing with no product, giant blob of paste',
  },
  soap_bar: {
    key: 'soap_bar',
    label: 'สบู่ก้อน',
    promptStill: 'A solid bar of soap resting on the palm or a clean dish, dry and smooth.',
    promptVideo:
      'the soap bar is rubbed between wet hands or over damp skin, building a soft creamy lather that is then massaged in.',
    negative: 'eating the soap, dry soap with no lather, soap dissolving into liquid instantly',
  },
  facial_cleanser: {
    key: 'facial_cleanser',
    label: 'โฟมล้างหน้า',
    promptStill: 'A facial cleanser ready to use — a small amount in the palm, near a clean sink.',
    promptVideo:
      'the cleanser is worked into a soft foam in wet hands, then massaged over the face in gentle circular motions and rinsed with water.',
    negative: 'scrubbing harshly, foam in the eyes, product left unrinsed, cleanser used on the body only',
  },
  shampoo: {
    key: 'shampoo',
    label: 'แชมพู',
    promptStill: 'A dollop of shampoo poured into an open palm, near damp hair.',
    promptVideo:
      'shampoo is poured into the palm and worked into wet hair and scalp, building a rich lather with gentle massaging.',
    negative: 'shampoo on dry hair with no lather, product dripping into eyes, eating or drinking it',
  },
  body_lotion: {
    key: 'body_lotion',
    label: 'โลชั่นบำรุงผิว',
    promptStill: 'A soft dollop of lotion on the back of the hand or fingertips, near bare skin.',
    promptVideo:
      'the lotion is smoothed and massaged over the arms or legs, blending into the skin with a soft non-greasy finish.',
    negative: 'lotion on the face only, greasy oily film, product not spread, eating the lotion',
  },
  sunscreen: {
    key: 'sunscreen',
    label: 'ครีมกันแดด',
    promptStill: 'A dot of sunscreen on the fingertips or cheek, ready to blend.',
    promptVideo:
      'sunscreen is dotted over the face and blended in evenly with the fingertips until it disappears into a natural finish.',
    negative: 'thick white cast left unblended, sunscreen in the eyes, applied like a mask',
  },
  face_serum: {
    key: 'face_serum',
    label: 'เซรั่มบำรุงผิวหน้า',
    promptStill: 'A few drops of serum on the fingertips or a dropper held above the face.',
    promptVideo:
      'a few drops of serum are pressed and patted gently into the facial skin until fully absorbed with a soft glow.',
    negative: 'serum dripping and wasted, rubbed harshly, applied to the body, eaten',
  },
  supplement: {
    key: 'supplement',
    label: 'อาหารเสริม (กิน)',
    promptStill: 'One or two capsules/tablets in an open palm, a glass of water nearby.',
    promptVideo:
      'one or two pieces are tipped into the palm, shown briefly, then taken by mouth with a glass of water.',
    negative: 'a handful of many pills, chewing dramatically, crushing pills, applying to skin',
  },
  drink_mix: {
    key: 'drink_mix',
    label: 'เครื่องดื่มชง',
    promptStill: 'A clear glass of water with the product ready to be mixed in beside it.',
    promptVideo:
      'the product is poured into a glass of water and stirred until it dissolves into a smooth even drink, then raised for a sip.',
    negative: 'undissolved clumps, muddy drink, eaten dry, overflowing glass',
  },
  deodorant: {
    key: 'deodorant',
    label: 'โรลออน/ระงับกลิ่นกาย',
    promptStill: 'A deodorant applicator held near the underarm, ready to apply.',
    promptVideo:
      'the deodorant is glided smoothly along the underarm in a few even strokes, leaving a clean invisible finish.',
    negative: 'applied to the face, thick white residue, product flaking off',
  },
};

export function getProductTypePrompt(key: string): ProductTypePrompt | null {
  return PRODUCT_TYPE_PROMPTS[key] ?? null;
}
