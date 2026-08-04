-- AlterTable
ALTER TABLE "affiliate_clip_jobs" ADD COLUMN     "clientId" UUID,
ADD COLUMN     "conceptsJson" JSONB,
ADD COLUMN     "ctaType" TEXT NOT NULL DEFAULT 'basket',
ADD COLUMN     "headline" TEXT,
ADD COLUMN     "locationId" UUID,
ADD COLUMN     "selectedConceptIndex" INTEGER,
ADD COLUMN     "subjectBrief" JSONB,
ADD COLUMN     "subjectType" TEXT NOT NULL DEFAULT 'product',
ADD COLUMN     "voiceProfileId" UUID,
ADD COLUMN     "voiceSpec" TEXT,
ADD COLUMN     "wardrobeId" UUID,
ALTER COLUMN "productId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "clip_shots" ADD COLUMN     "onScreenText" TEXT,
ADD COLUMN     "sceneType" TEXT NOT NULL DEFAULT 'hands',
ADD COLUMN     "voiceType" TEXT;
