-- AlterTable
ALTER TABLE "interaction_template_steps" ADD COLUMN     "cameraId" UUID,
ADD COLUMN     "lightingId" UUID;

-- AlterTable
ALTER TABLE "interaction_templates" ADD COLUMN     "defaultCameraId" UUID,
ADD COLUMN     "defaultLightingId" UUID;

-- CreateTable
CREATE TABLE "camera_presets" (
    "id" UUID NOT NULL,
    "displayCode" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "shotSize" TEXT,
    "angle" TEXT,
    "lens" TEXT,
    "focalLength" TEXT,
    "cameraMovement" TEXT,
    "movementSpeed" TEXT,
    "distance" TEXT,
    "focusTarget" TEXT,
    "depthOfField" TEXT,
    "stabilization" TEXT,
    "aspectRatio" TEXT,
    "safeArea" TEXT,
    "productVisibility" TEXT,
    "handVisibility" TEXT,
    "compatiblePackaging" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "promptTemplate" TEXT,
    "negativePrompt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "camera_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lighting_presets" (
    "id" UUID NOT NULL,
    "displayCode" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "keyLight" TEXT,
    "fillLight" TEXT,
    "backLight" TEXT,
    "colorTemperature" TEXT,
    "contrast" TEXT,
    "shadowLevel" TEXT,
    "highlightControl" TEXT,
    "reflectiveProductRule" TEXT,
    "transparentProductRule" TEXT,
    "skinToneCompatibility" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "backgroundCompatibility" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mood" TEXT,
    "promptTemplate" TEXT,
    "negativePrompt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "lighting_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "camera_presets_displayCode_key" ON "camera_presets"("displayCode");

-- CreateIndex
CREATE UNIQUE INDEX "camera_presets_key_key" ON "camera_presets"("key");

-- CreateIndex
CREATE INDEX "camera_presets_shotSize_status_idx" ON "camera_presets"("shotSize", "status");

-- CreateIndex
CREATE UNIQUE INDEX "lighting_presets_displayCode_key" ON "lighting_presets"("displayCode");

-- CreateIndex
CREATE UNIQUE INDEX "lighting_presets_key_key" ON "lighting_presets"("key");

-- CreateIndex
CREATE INDEX "lighting_presets_mood_status_idx" ON "lighting_presets"("mood", "status");
