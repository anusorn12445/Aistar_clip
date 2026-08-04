-- AlterTable
ALTER TABLE "series" ADD COLUMN     "targetViews" INTEGER,
ADD COLUMN     "targetViewsUnit" TEXT DEFAULT 'per_episode';

-- CreateTable
CREATE TABLE "audience_segments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "gender" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "spendingPower" TEXT,
    "region" TEXT,
    "painPoint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audience_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_audiences" (
    "characterId" UUID NOT NULL,
    "segmentId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "character_audiences_pkey" PRIMARY KEY ("characterId","segmentId")
);

-- CreateTable
CREATE TABLE "series_audiences" (
    "seriesId" UUID NOT NULL,
    "segmentId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "series_audiences_pkey" PRIMARY KEY ("seriesId","segmentId")
);

-- CreateIndex
CREATE INDEX "character_audiences_segmentId_idx" ON "character_audiences"("segmentId");

-- CreateIndex
CREATE INDEX "series_audiences_segmentId_idx" ON "series_audiences"("segmentId");

-- AddForeignKey
ALTER TABLE "character_audiences" ADD CONSTRAINT "character_audiences_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_audiences" ADD CONSTRAINT "character_audiences_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "audience_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_audiences" ADD CONSTRAINT "series_audiences_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_audiences" ADD CONSTRAINT "series_audiences_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "audience_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
