// Prompt ประเภทสินค้า (Packaging Prompts) — บล็อกพรอมป์ต่อ "รูปแบบแพ็กเกจ" ของสินค้า
// ผูกกับ Product.packagingType → ผนวกเข้า stillPrompt ทุกฉากที่เห็นสินค้า + negative กันเพี้ยนเฉพาะแพ็กเกจ
// override ผ่านหน้า สูตรคลิป (SystemSetting key 'ugc.packaging.overrides') — built-in ในไฟล์นี้คือค่าเริ่มต้น

export interface PackagingPrompt {
  key: string;
  label: string; // ป้ายไทยตรงกับ dropdown
  prompt: string; // EN — ค่าเดิม/fallback (ใช้เมื่อ promptStill/promptVideo ไม่ได้ตั้ง)
  promptStill?: string; // EN — ภาษาหยุดนิ่ง ป้อนเข้า stillPrompt ทุกฉากที่เห็นสินค้า
  promptVideo?: string; // EN — ภาษาการเคลื่อนไหว ป้อนเข้า motionPrompt ทุกฉากที่เห็นสินค้า
  negative: string; // ค่าเดิม/fallback (ใช้เมื่อ negativeStill/negativeVideo ไม่ได้ตั้ง)
  negativeStill?: string; // กันเพี้ยนเฉพาะภาพนิ่ง (เข้า AVOID ของ stillPrompt)
  negativeVideo?: string; // กันเพี้ยนเฉพาะวิดีโอ (เข้า negativePrompt ของ motion)
}

// ตัวช่วยดึงภาษา still/video จากแพ็กเกจ — fallback ไป prompt เดิมถ้ายังไม่แยก
export function packagingStill(p: PackagingPrompt): string {
  return (p.promptStill ?? p.prompt ?? '').trim();
}
export function packagingVideo(p: PackagingPrompt): string {
  return (p.promptVideo ?? p.prompt ?? '').trim();
}
export function packagingNegStill(p: PackagingPrompt): string {
  return (p.negativeStill ?? p.negative ?? '').trim();
}
export function packagingNegVideo(p: PackagingPrompt): string {
  return (p.negativeVideo ?? p.negative ?? '').trim();
}

export const PACKAGING_PROMPTS: Record<string, PackagingPrompt> = {
  jelly_stick_sachet: {
    key: 'jelly_stick_sachet',
    label: 'เจลลี่แท่งซองฉีก',
    prompt:
      'Product form: single-serve jelly stick sachet. Long slim foil sachet held between fingers; tear notch at the top. When consumed: tear across the notch, then squeeze the jelly upward from the bottom directly into the mouth. Glossy jelly texture may peek from the torn opening. Sachet stays slightly curved, never rigid.',
    negative:
      'rigid flat sachet, jelly in a cup or spoon, opened with scissors, contents poured into a glass',
  },
  powder_mix: {
    key: 'powder_mix',
    label: 'ผงชงละลายน้ำ',
    prompt:
      'Product form: powder drink mix sachet/tub. Fine powder poured from the sachet into a clear glass of water, then stirred with a spoon until fully dissolved — show the swirl while mixing. Finished drink is translucent and smooth with no residue. Sachet torn at the top corner only.',
    negative:
      'clumpy undissolved powder floating, muddy opaque drink, powder eaten dry, overflowing glass',
  },
  pill_capsule: {
    key: 'pill_capsule',
    label: 'เม็ด/แคปซูล',
    prompt:
      'Product form: pills/capsules in a bottle or blister pack. Shake 1-2 pieces into an open palm, pinch one between thumb and index finger to show size, then take with a glass of water. Blister pack pressed from the back to pop a pill out. Pills are uniform in size, shape and color.',
    negative:
      'handful of many pills, melted or deformed capsules, pills of mixed random shapes, chewing pills dramatically',
  },
  gummy: {
    key: 'gummy',
    label: 'กัมมี่เคี้ยว',
    prompt:
      'Product form: chewable gummy in a pouch/jar. Pick one gummy out with fingertips, slight bouncy squish when pressed to show soft chew texture, then eat naturally with a pleasant expression. Gummies are glossy, evenly shaped, appetizing food-grade colors.',
    negative:
      'melted sticky gummies fused together, dull matte surface, sharp hard edges, spitting out',
  },
  ready_drink: {
    key: 'ready_drink',
    label: 'พร้อมดื่ม (ขวด/ซอง)',
    prompt:
      'Product form: ready-to-drink bottle or pouch. Twist cap or tear/insert straw, then drink naturally — condensation droplets on a chilled bottle are welcome. Label faces the camera while holding. Liquid level visibly decreases after drinking.',
    negative:
      'drinking with cap still closed, label facing away, spilling down the chin, empty bottle that still pours',
  },
  cream_jar: {
    key: 'cream_jar',
    label: 'ครีมกระปุก',
    prompt:
      'Product form: cream in a jar. Twist the lid open with one hand while holding the jar in the other; scoop a small amount with a clean fingertip or spatula showing a soft peak of cream, then apply with gentle circular strokes. Cream surface inside the jar looks smooth and untouched at first reveal.',
    negative:
      'digging deep holes in cream, dirty fingernails, lid opening like a hinge, cream dripping liquid-thin',
  },
  pump_bottle: {
    key: 'pump_bottle',
    label: 'ขวดปั๊ม (เซรั่ม/โลชั่น)',
    prompt:
      'Product form: pump bottle (serum/lotion). Press the pump head down with one finger — 1-2 pumps dispensing a controlled dollop onto the back of the hand or fingertips. Show the product texture (serum = translucent glossy drop, lotion = soft creamy dollop) before spreading. Pump nozzle points sideways-down naturally.',
    negative:
      'product squirting far like a jet, pump pressed but nothing visible, cap-style twisting on a pump head, broken pump mechanism',
  },
  squeeze_tube: {
    key: 'squeeze_tube',
    label: 'หลอดบีบ',
    prompt:
      'Product form: squeeze tube. Flip or twist the cap open, squeeze gently from the middle/end of the tube so a neat ribbon of product comes out onto a fingertip or brush — pea-sized to 2 cm, clean cut end. Tube shows a soft dent where squeezed. Cap placed nearby or held in the same hand.',
    negative:
      'product exploding out in excess, tube squeezed flat and crumpled, ribbon smearing everywhere, cap missing entirely',
  },
  spray: {
    key: 'spray',
    label: 'สเปรย์ฉีด',
    prompt:
      'Product form: spray bottle. Hold upright 15-20 cm from the target, press the trigger/nozzle — a fine even mist cloud appears briefly, backlit if possible for visibility. 1-2 short sprays, wrist steady. Nozzle aimed at the application area, never at the face directly unless it is a face mist used with eyes closed.',
    negative:
      'liquid jet stream instead of mist, dripping wet surface, spraying into open eyes, continuous fog filling the room',
  },
  dropper: {
    key: 'dropper',
    label: 'หลอดหยด (dropper)',
    prompt:
      'Product form: dropper bottle. Squeeze the rubber bulb to draw liquid, lift the glass pipette showing the liquid inside, release 2-3 clean drops onto the palm, fingertips, or application area. Each drop is a distinct rounded bead. Dropper returned into the bottle after use.',
    negative:
      'liquid pouring in a stream from the dropper, drops splashing wide, cloudy dirty pipette, dropper touching skin directly',
  },
  unbox_item: {
    key: 'unbox_item',
    label: 'ของใช้แกะกล่อง (สิ่งของชิ้นเดียว)',
    prompt:
      'Product form: single boxed item. Unbox in order — slide/lift the outer box lid, remove protective wrap, lift the item out with both hands and rotate slowly to show all sides. Box and packaging stay in frame as part of the story. The item is the exact one from the box (same color, same model).',
    negative:
      'item appearing without opening the box, torn destroyed packaging, different item than the box shows, floating unbox',
  },
  gadget: {
    key: 'gadget',
    label: 'แกดเจ็ต/เครื่องใช้ไฟฟ้า',
    prompt:
      'Product form: gadget/electronic device. Power on with a visible button press — a subtle indicator light or screen glow confirms it is on. Demonstrate the main function with natural hand operation. Cables/ports shown only when relevant. Any device screen in frame stays angled or softly blurred (no readable fake UI).',
    negative:
      'readable fake screen UI, floating holograms, sparks or smoke, buttons pressing themselves, wrong port shapes',
  },
  fashion_tryon: {
    key: 'fashion_tryon',
    label: 'เสื้อผ้า/แฟชั่น (ลองใส่)',
    prompt:
      'Product form: fashion item worn on body. Show the garment on a hanger or held up first, then worn — fit, drape and fabric movement visible while turning or walking a few steps. Fabric texture (knit, satin sheen, denim weave) reads clearly in close-ups. Same garment, same color in every scene.',
    negative:
      'garment morphing between scenes, distorted body proportions, floating clothes with no body, wrinkled dirty fabric presented as new',
  },
  home_item: {
    key: 'home_item',
    label: 'ของใช้ในบ้าน (อุปกรณ์/ที่จัดเก็บ)',
    prompt:
      'Product form: home/organizer item. Show the real use-case: place it in its intended spot, open/close lids or drawers smoothly, put real household objects inside to show capacity. Before-after of the tidy result works well. Scale stays true to real product dimensions.',
    negative:
      'impossible capacity (bigger inside than outside), items clipping through walls, wobbling unstable product, wrong scale vs hands',
  },
  pour_bottle: {
    key: 'pour_bottle',
    label: 'น้ำยาขวดเท (ซักผ้า/ล้างจาน/ทำความสะอาด)',
    prompt:
      'Product form: pour-type liquid bottle (detergent/cleaner). Flip open or unscrew the cap, tilt and pour a measured amount into the cap-cup, machine drawer, sponge, or bucket — steady stream, no glugging splash. Liquid color and viscosity consistent with the real product. Bottle label faces camera while pouring.',
    negative:
      'splashing overflow, liquid changing color mid-pour, pouring directly onto clothes in the machine drum when a drawer exists, foam explosion',
  },
  flip_top: {
    key: 'flip_top',
    label: 'เปิดใช้งานด้วยฝา Flip-top',
    prompt:
      'Product form: flip-top cap product. Thumb flicks the hinged cap open with a satisfying snap — cap stays attached on its hinge at an open angle. Dispense by squeezing or shaking through the flip opening. Close with a one-hand press click at the end.',
    negative:
      'cap detaching completely, hinge on the wrong side, cap opening by itself, screwing motion on a flip-top',
  },
};

export const PACKAGING_KEYS = Object.keys(PACKAGING_PROMPTS);
