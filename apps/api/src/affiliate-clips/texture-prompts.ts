// พรอมเนื้อสัมผัส (Texture Prompts) — บล็อกพรอมป์ต่อ "เนื้อสัมผัสของตัวสินค้า" (เจล/ครีม/เม็ด/โฟม ...)
// ผูกกับ Product.textureType → ผนวกท้าย packaging (ฝาเกลียว/ขวดปั๊ม = วิธีใช้ที่ "นำเข้า" การโชว์เนื้อเสมอ)
// override ผ่านหน้า สูตรคลิป แท็บ "เนื้อสัมผัส" (SystemSetting key 'ugc.texture.overrides')

export interface TexturePrompt {
  key: string;
  label: string; // ป้ายไทยตรงกับ dropdown
  promptStill: string; // EN — เนื้อสัมผัสในภาพนิ่ง (ลักษณะ/สี/ความมันเงา)
  promptVideo: string; // EN — พฤติกรรมเนื้อตอนใช้งาน (ต่อจากการเปิด/จ่าย)
  negative: string; // กันเนื้อเพี้ยน
}

export function textureStill(t: TexturePrompt): string {
  return (t.promptStill ?? '').trim();
}
export function textureVideo(t: TexturePrompt): string {
  return (t.promptVideo ?? '').trim();
}

export const TEXTURE_PROMPTS: Record<string, TexturePrompt> = {
  gel: {
    key: 'gel',
    label: 'เนื้อเจล',
    promptStill:
      'Texture: a clear, translucent gel with a soft glossy sheen — smooth and slightly wet-looking, holding a gentle rounded shape without dripping.',
    promptVideo:
      'the clear glossy gel is squeezed/dispensed out and smoothed onto the skin, spreading into a thin see-through layer that sinks in with a light dewy finish.',
    negative: 'thick opaque paste, dry crumbly texture, foamy bubbles, runny watery liquid',
  },
  cream: {
    key: 'cream',
    label: 'เนื้อครีม',
    promptStill:
      'Texture: a rich, opaque cream — smooth, matte-to-soft-satin, holding a firm dollop shape with clean peaks, no separation.',
    promptVideo:
      'a smooth dollop of opaque cream is dispensed and massaged into the skin, blending from white to a soft natural finish that melts in evenly.',
    negative: 'translucent gel, watery runny liquid, greasy oily shine, curdled or separated texture',
  },
  pill: {
    key: 'pill',
    label: 'เม็ด / แคปซูล',
    promptStill:
      'Texture: solid uniform tablets/capsules — smooth even surface, consistent size, shape and color, clean and dry.',
    promptVideo:
      'one or two tablets/capsules are tipped into an open palm, held up briefly to show their size, then taken with a glass of water.',
    negative: 'melted or deformed capsules, powder spilling out, mixed random shapes and colors, crushed pills',
  },
  foam: {
    key: 'foam',
    label: 'เนื้อโฟม',
    promptStill:
      'Texture: light airy whipped foam — dense fine bubbles, soft cloud-like peaks with a matte micro-foam surface.',
    promptVideo:
      'the product is worked into a rich airy foam between the hands or on the skin, building soft fine bubbles that glide smoothly.',
    negative: 'flat liquid with no bubbles, large soapy bubbles, thick paste, greasy film',
  },
  powder: {
    key: 'powder',
    label: 'เนื้อผง',
    promptStill:
      'Texture: fine loose powder — soft, even, matte, lightly clumping only where scooped, natural single tone.',
    promptVideo:
      'the fine powder is poured/scooped and stirred into water, dissolving into a smooth even drink with a light swirl and no residue.',
    negative: 'wet paste, coarse gritty lumps, undissolved clumps floating, muddy opaque mixture',
  },
  serum: {
    key: 'serum',
    label: 'เนื้อเซรั่ม',
    promptStill:
      'Texture: a lightweight watery serum with a faint silky sheen — a single clear drop sitting on the dropper tip or fingertip.',
    promptVideo:
      'a few drops of the lightweight serum are dispensed and pressed into the skin, spreading in a thin fast-absorbing layer with a soft glow.',
    negative: 'thick heavy cream, sticky tacky residue, foamy bubbles, cloudy separated liquid',
  },
  liquid: {
    key: 'liquid',
    label: 'ของเหลว / โทนเนอร์',
    promptStill:
      'Texture: a clear thin liquid — watery and fluid with a light natural surface reflection, no thickness.',
    promptVideo:
      'the clear liquid is poured onto a cotton pad or into the palm and swept over the skin, light and fast with a fresh watery feel.',
    negative: 'thick gel, creamy opacity, foam or bubbles, oily film',
  },
  balm: {
    key: 'balm',
    label: 'เนื้อบาล์ม',
    promptStill:
      'Texture: a thick, waxy balm with a soft satin surface — firm but scoopable, holding a smooth dented shape where touched.',
    promptVideo:
      'a small amount of the waxy balm is scooped and warmed between the fingertips, melting into a soft emollient layer as it is smoothed on.',
    negative: 'runny liquid, foamy lather, thin watery serum, dry flaky texture',
  },
};

export function getTexturePrompt(key: string): TexturePrompt | null {
  return TEXTURE_PROMPTS[key] ?? null;
}
