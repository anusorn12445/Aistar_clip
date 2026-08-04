import { Character, Prisma, PrismaClient } from '@prisma/client';
import { TURNAROUND_ANGLES } from './image-prompt';
import type { CharacterSheetData } from './character-markdown';

// ประกอบข้อมูล Character Sheet (wardrobe/expression/pose/turnaround/blueprint) — helper กลาง
// ใช้ร่วมกันระหว่าง Export Package และ zip ของ Asset Gallery (กัน logic สองก๊อปเพี้ยนกัน)
// prisma รับเป็น client ตรง ๆ (pure function, ไม่ผูก DI — เรียกได้จากทุก module)

type PrismaLike = PrismaClient | Prisma.TransactionClient;

type AssetLinkWithAsset = {
  linkRole: string;
  asset: { originalFilename: string; archivedAt: Date | null; mimeType: string };
};

export async function buildCharacterSheetData(
  prisma: PrismaLike,
  character: Character,
  presetAssetLinks?: AssetLinkWithAsset[],
): Promise<CharacterSheetData> {
  const [assetLinks, wardrobes, expressions, poses, blueprint] = await Promise.all([
    presetAssetLinks
      ? Promise.resolve(presetAssetLinks)
      : prisma.assetLink.findMany({
          where: { entityType: 'character', entityId: character.id },
          include: { asset: true },
        }),
    prisma.characterWardrobe.findMany({
      where: { characterId: character.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.characterExpression.findMany({
      where: { characterId: character.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.characterPose.findMany({
      where: { characterId: character.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    character.blueprintId
      ? prisma.characterBlueprint.findUnique({ where: { id: character.blueprintId } })
      : prisma.characterBlueprint.findFirst({ where: { isDefault: true, status: 'active' } }),
  ]);

  const activeImageLink = (role: string) =>
    assetLinks.find(
      (l) => l.linkRole === role && !l.asset.archivedAt && l.asset.mimeType.startsWith('image/'),
    );

  return {
    wardrobes,
    expressions,
    poses,
    turnaroundSheet: activeImageLink('turnaround_sheet')?.asset.originalFilename ?? null,
    turnaround: TURNAROUND_ANGLES.map((a) => ({
      role: a.role,
      labelTh: a.labelTh,
      labelEn: a.labelEn,
      filename: activeImageLink(a.role)?.asset.originalFilename ?? null,
    })),
    hasReference: !!activeImageLink('prompt_reference'),
    blueprint: blueprint
      ? {
          name: blueprint.name,
          houseRules: blueprint.houseRules,
          requiredFields: blueprint.requiredFields,
        }
      : null,
  };
}
