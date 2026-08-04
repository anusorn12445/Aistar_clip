-- CreateTable
CREATE TABLE "affiliate_clip_jobs" (
    "id" UUID NOT NULL,
    "displayCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productId" UUID NOT NULL,
    "outputType" TEXT NOT NULL DEFAULT 'video',
    "mode" TEXT NOT NULL DEFAULT 'hand',
    "handId" UUID,
    "characterId" UUID,
    "templateId" UUID,
    "directorRunId" UUID,
    "platform" TEXT,
    "aspectRatio" TEXT DEFAULT '9:16',
    "targetDurationSec" DOUBLE PRECISION,
    "script" TEXT,
    "caption" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "affiliateLink" TEXT,
    "finalVideoUrl" TEXT,
    "finalNote" TEXT,
    "planJson" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "affiliate_clip_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clip_shots" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "shotOrder" INTEGER NOT NULL,
    "section" TEXT NOT NULL DEFAULT 'interaction',
    "title" TEXT,
    "gestureId" UUID,
    "handId" UUID,
    "cameraId" UUID,
    "lightingId" UUID,
    "durationSec" DOUBLE PRECISION,
    "dialogue" TEXT,
    "stillPrompt" TEXT,
    "motionPrompt" TEXT,
    "negativePrompt" TEXT,
    "stillAssetId" UUID,
    "videoUrl" TEXT,
    "genSource" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clip_shots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_clip_jobs_displayCode_key" ON "affiliate_clip_jobs"("displayCode");

-- CreateIndex
CREATE INDEX "affiliate_clip_jobs_productId_status_idx" ON "affiliate_clip_jobs"("productId", "status");

-- CreateIndex
CREATE INDEX "affiliate_clip_jobs_status_idx" ON "affiliate_clip_jobs"("status");

-- CreateIndex
CREATE INDEX "clip_shots_jobId_shotOrder_idx" ON "clip_shots"("jobId", "shotOrder");

-- AddForeignKey
ALTER TABLE "clip_shots" ADD CONSTRAINT "clip_shots_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "affiliate_clip_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
