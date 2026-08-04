-- CreateTable
CREATE TABLE "director_runs" (
    "id" UUID NOT NULL,
    "displayCode" TEXT NOT NULL,
    "productId" UUID,
    "brandId" UUID,
    "productCategory" TEXT,
    "packagingType" TEXT,
    "platform" TEXT,
    "targetDurationSec" DOUBLE PRECISION,
    "objective" TEXT,
    "creativeStyle" TEXT,
    "language" TEXT NOT NULL DEFAULT 'th',
    "preferredHandId" UUID,
    "notes" TEXT,
    "recommendedTemplateId" UUID,
    "resultJson" JSONB,
    "reasoning" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "errorMessage" TEXT,
    "appliedTemplateId" UUID,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "director_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "director_runs_displayCode_key" ON "director_runs"("displayCode");

-- CreateIndex
CREATE INDEX "director_runs_productId_idx" ON "director_runs"("productId");

-- CreateIndex
CREATE INDEX "director_runs_status_idx" ON "director_runs"("status");
