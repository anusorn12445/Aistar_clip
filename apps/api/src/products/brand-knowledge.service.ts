import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// สรุป segment แบบย่อ ที่ใช้ประกอบ context กลุ่มเป้าหมาย
const SEGMENT_SUMMARY = {
  id: true,
  name: true,
  description: true,
  ageMin: true,
  ageMax: true,
  gender: true,
  interests: true,
  platforms: true,
  spendingPower: true,
  region: true,
  painPoint: true,
  status: true,
} satisfies Prisma.AudienceSegmentSelect;

const GENDER_TH: Record<string, string> = {
  any: 'ทุกเพศ',
  female: 'หญิง',
  male: 'ชาย',
  mixed: 'ผสม',
};
const SPENDING_TH: Record<string, string> = {
  low: 'กำลังซื้อต่ำ',
  medium: 'กำลังซื้อกลาง',
  high: 'กำลังซื้อสูง',
};

/**
 * BrandKnowledgeService — ประกอบ "ความรู้แบรนด์" เป็น context ภาษาไทย
 * สำหรับฉีดเข้า prompt ของ Content Intelligence ระบบ 2/3/4
 *
 * ⚠️ ระบบ 2/3/4 พึ่ง `buildBrandContext(brandId)` ตัวนี้โดยตรง — export จาก ProductsModule
 */
@Injectable()
export class BrandKnowledgeService {
  constructor(private prisma: PrismaService) {}

  /**
   * คืน text block ภาษาไทยที่ประกอบจากความรู้แบรนด์ทั้งหมด
   * (ชื่อ, เรื่องราว, โทนเสียง, do/don't, สารหลัก, USP, คำต้องห้าม,
   *  อัตลักษณ์ภาพ, คู่แข่ง, กลุ่มเป้าหมาย)
   *
   * null-safe: ข้ามฟิลด์ที่ว่าง — คืน '' ถ้าแบรนด์ยังไม่มีความรู้ใด ๆ เลย
   */
  async buildBrandContext(brandId: string): Promise<string> {
    const brand = await this.prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) return '';

    const audienceLinks = await this.prisma.brandAudience.findMany({
      where: { brandId },
      include: { segment: { select: SEGMENT_SUMMARY } },
    });

    const s = (v: string | null | undefined): string => (v ?? '').trim();
    const arr = (v: string[] | null | undefined): string[] =>
      (v ?? []).map((x) => x.trim()).filter((x) => x.length > 0);

    const doList = arr(brand.doList);
    const dontList = arr(brand.dontList);
    const keyMessages = arr(brand.keyMessages);
    const restrictedClaims = arr(brand.restrictedClaims);

    // ─── Brand Book fields (spec: _docs/brand_book_requirement.md) ──
    const coreValues = arr(brand.coreValues);
    const wordBankUse = arr(brand.wordBankUse);
    const wordBankAvoid = arr(brand.wordBankAvoid);
    // platformGuides: {facebook: "...", ...} — เก็บเฉพาะคู่ที่ value เป็น string มีเนื้อ
    const platformGuides: [string, string][] =
      brand.platformGuides && typeof brand.platformGuides === 'object' && !Array.isArray(brand.platformGuides)
        ? Object.entries(brand.platformGuides as Record<string, unknown>)
            .filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim().length > 0)
            .map(([k, v]) => [k, v.trim()])
        : [];
    // brandColors: [{token, dark, light, usage}] — เอาเฉพาะแถวที่มี token
    const brandColors = (Array.isArray(brand.brandColors) ? brand.brandColors : [])
      .filter((c): c is { token: string; dark?: string; light?: string; usage?: string } => {
        if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
        const t = (c as Record<string, unknown>).token;
        return typeof t === 'string' && t.trim().length > 0;
      });

    // มี "ความรู้" ไหม? (นอกเหนือ name/contact/notes เดิม)
    const hasKnowledge =
      !!s(brand.brandStory) ||
      !!s(brand.toneOfVoice) ||
      !!s(brand.usp) ||
      !!s(brand.visualIdentity) ||
      !!s(brand.competitorsNote) ||
      doList.length > 0 ||
      dontList.length > 0 ||
      keyMessages.length > 0 ||
      restrictedClaims.length > 0 ||
      audienceLinks.length > 0 ||
      // Brand Book เต็มรูป
      !!s(brand.mission) ||
      !!s(brand.vision) ||
      !!s(brand.positioning) ||
      !!s(brand.personality) ||
      !!s(brand.tagline) ||
      !!s(brand.exampleOnBrand) ||
      !!s(brand.exampleOffBrand) ||
      !!s(brand.nameUsage) ||
      !!s(brand.moodNote) ||
      coreValues.length > 0 ||
      wordBankUse.length > 0 ||
      wordBankAvoid.length > 0 ||
      platformGuides.length > 0 ||
      brandColors.length > 0;

    if (!hasKnowledge) return '';

    const bullet = (items: string[]): string => items.map((i) => `- ${i}`).join('\n');

    const parts: string[] = [];
    parts.push(`แบรนด์: ${s(brand.name)}`);

    if (s(brand.brandStory)) parts.push(`เรื่องราวแบรนด์:\n${s(brand.brandStory)}`);
    if (s(brand.toneOfVoice)) parts.push(`โทนเสียงในการสื่อสาร: ${s(brand.toneOfVoice)}`);
    if (doList.length) parts.push(`สิ่งที่ควรทำ/พูด (Do):\n${bullet(doList)}`);
    if (dontList.length) parts.push(`สิ่งที่ห้ามทำ/พูด (Don't):\n${bullet(dontList)}`);
    if (keyMessages.length) parts.push(`สารหลักที่ต้องสื่อ:\n${bullet(keyMessages)}`);
    if (s(brand.usp)) parts.push(`จุดขายที่ต่างจากคู่แข่ง (USP): ${s(brand.usp)}`);
    if (restrictedClaims.length)
      parts.push(
        `คำ/เคลมที่ห้ามใช้เด็ดขาด (ระดับแบรนด์):\n${bullet(restrictedClaims)}`,
      );
    if (s(brand.visualIdentity)) parts.push(`อัตลักษณ์ภาพ (สี/มู้ด/สไตล์): ${s(brand.visualIdentity)}`);
    if (s(brand.competitorsNote)) parts.push(`คู่แข่งหลัก + จุดต่าง: ${s(brand.competitorsNote)}`);

    if (audienceLinks.length) {
      const sorted = [...audienceLinks].sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.segment.name.localeCompare(b.segment.name, 'th');
      });
      const lines = sorted.map((l) => {
        const seg = l.segment;
        const bits: string[] = [];
        if (seg.ageMin != null || seg.ageMax != null) {
          if (seg.ageMin != null && seg.ageMax != null) bits.push(`${seg.ageMin}-${seg.ageMax} ปี`);
          else if (seg.ageMin != null) bits.push(`${seg.ageMin}+ ปี`);
          else if (seg.ageMax != null) bits.push(`ถึง ${seg.ageMax} ปี`);
        }
        if (seg.gender && seg.gender !== 'any') bits.push(GENDER_TH[seg.gender] ?? seg.gender);
        if (seg.spendingPower) bits.push(SPENDING_TH[seg.spendingPower] ?? seg.spendingPower);
        const interests = (seg.interests ?? []).filter((x) => x.trim().length > 0);
        if (interests.length) bits.push(`สนใจ: ${interests.join(', ')}`);
        if (seg.painPoint && seg.painPoint.trim()) bits.push(`pain: ${seg.painPoint.trim()}`);
        const meta = bits.length ? ` (${bits.join(' · ')})` : '';
        const star = l.isPrimary ? ' ⭐ กลุ่มหลัก' : '';
        return `- ${seg.name}${star}${meta}`;
      });
      parts.push(`กลุ่มเป้าหมาย:\n${lines.join('\n')}`);
    }

    // ─── Brand Book เต็มรูป — append ต่อท้าย section เดิม (append-only) ──
    if (s(brand.mission)) parts.push(`พันธกิจ (Mission): ${s(brand.mission)}`);
    if (s(brand.vision)) parts.push(`วิสัยทัศน์ (Vision): ${s(brand.vision)}`);
    if (coreValues.length) parts.push(`ค่านิยมหลัก (Core Values): ${coreValues.join(' · ')}`);
    if (s(brand.positioning)) parts.push(`Positioning (เราคือใคร ให้ใคร ต่างยังไง): ${s(brand.positioning)}`);
    if (s(brand.personality)) parts.push(`บุคลิกแบรนด์ (Personality/Archetype): ${s(brand.personality)}`);
    if (s(brand.tagline)) {
      const font = s(brand.taglineFont) ? ` (ฟอนต์สโลแกน: ${s(brand.taglineFont)})` : '';
      parts.push(`สโลแกน/Tagline: "${s(brand.tagline)}"${font}`);
    }
    if (wordBankUse.length) parts.push(`คำที่ใช้ (Word Bank — เลือกใช้คำเหล่านี้):\n${bullet(wordBankUse)}`);
    if (wordBankAvoid.length)
      parts.push(`คำที่เลี่ยง (Word Bank — ห้ามใช้คำ/โทนแบบนี้):\n${bullet(wordBankAvoid)}`);
    if (s(brand.exampleOnBrand))
      parts.push(`ตัวอย่างประโยค on-brand (เขียนแนวนี้):\n${s(brand.exampleOnBrand)}`);
    if (s(brand.exampleOffBrand))
      parts.push(`ตัวอย่างประโยค off-brand (ห้ามเขียนแบบนี้):\n${s(brand.exampleOffBrand)}`);
    if (platformGuides.length) {
      const lines = platformGuides.map(([platform, guide]) => `- ${platform}: ${guide}`);
      parts.push(`แนวการเขียนต่อแพลตฟอร์ม:\n${lines.join('\n')}`);
    }
    if (s(brand.nameUsage)) parts.push(`วิธีเขียนชื่อแบรนด์: ${s(brand.nameUsage)}`);
    if (s(brand.moodNote)) parts.push(`มู้ดภาพ (สไตล์ภาพถ่าย/กราฟิก): ${s(brand.moodNote)}`);
    if (brandColors.length) {
      const lines = brandColors.map((c) => {
        const vals: string[] = [];
        if (typeof c.dark === 'string' && c.dark.trim()) vals.push(`dark ${c.dark.trim()}`);
        if (typeof c.light === 'string' && c.light.trim()) vals.push(`light ${c.light.trim()}`);
        const usage = typeof c.usage === 'string' && c.usage.trim() ? ` — ${c.usage.trim()}` : '';
        return `- ${c.token.trim()}: ${vals.join(' / ')}${usage}`;
      });
      parts.push(`สีแบรนด์ (token):\n${lines.join('\n')}`);
    }

    return parts.join('\n\n');
  }
}
