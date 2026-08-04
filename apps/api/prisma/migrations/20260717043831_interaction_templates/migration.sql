-- CreateTable
CREATE TABLE "interaction_templates" (
    "id" UUID NOT NULL,
    "displayCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "productCategory" TEXT,
    "packagingType" TEXT,
    "materialType" TEXT,
    "platform" TEXT,
    "aspectRatio" TEXT,
    "storyboardType" TEXT,
    "targetDurationSec" DOUBLE PRECISION,
    "defaultHandId" UUID,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" TEXT NOT NULL DEFAULT 'v1',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "interaction_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interaction_template_steps" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "section" TEXT NOT NULL DEFAULT 'interaction',
    "gestureId" UUID,
    "handId" UUID,
    "cameraNote" TEXT,
    "lightingNote" TEXT,
    "durationSec" DOUBLE PRECISION,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interaction_template_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interaction_templates_displayCode_key" ON "interaction_templates"("displayCode");

-- CreateIndex
CREATE INDEX "interaction_templates_packagingType_status_idx" ON "interaction_templates"("packagingType", "status");

-- CreateIndex
CREATE INDEX "interaction_templates_productCategory_idx" ON "interaction_templates"("productCategory");

-- CreateIndex
CREATE INDEX "interaction_template_steps_templateId_stepOrder_idx" ON "interaction_template_steps"("templateId", "stepOrder");

-- AddForeignKey
ALTER TABLE "interaction_template_steps" ADD CONSTRAINT "interaction_template_steps_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "interaction_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
