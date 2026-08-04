-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "blueprintId" UUID;

-- CreateTable
CREATE TABLE "character_blueprints" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "houseRules" TEXT,
    "requiredFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaults" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "character_blueprints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "character_blueprints_status_sortOrder_idx" ON "character_blueprints"("status", "sortOrder");
