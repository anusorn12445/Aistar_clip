-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "donts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "dos" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "character_poses" (
    "id" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_poses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "character_poses_characterId_idx" ON "character_poses"("characterId");

-- AddForeignKey
ALTER TABLE "character_poses" ADD CONSTRAINT "character_poses_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
