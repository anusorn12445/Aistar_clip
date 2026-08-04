-- AlterTable
ALTER TABLE "brands" ADD COLUMN     "brandStory" TEXT,
ADD COLUMN     "competitorsNote" TEXT,
ADD COLUMN     "doList" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "dontList" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "keyMessages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "restrictedClaims" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "toneOfVoice" TEXT,
ADD COLUMN     "usp" TEXT,
ADD COLUMN     "visualIdentity" TEXT;

-- AlterTable
ALTER TABLE "shots" ADD COLUMN     "imagePrompt" TEXT;

-- CreateTable
CREATE TABLE "brand_audiences" (
    "brandId" UUID NOT NULL,
    "segmentId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "brand_audiences_pkey" PRIMARY KEY ("brandId","segmentId")
);

-- CreateTable
CREATE TABLE "customer_feedback" (
    "id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "brandId" UUID,
    "productId" UUID,
    "characterId" UUID,
    "contentItemId" UUID,
    "sentiment" TEXT,
    "themes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiProcessedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ideation_runs" (
    "id" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "seedText" TEXT,
    "seedIdeaId" UUID,
    "brandId" UUID,
    "contextJson" JSONB,
    "resultJson" JSONB NOT NULL,
    "ideaCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ideation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_insights" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeRef" TEXT,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "summary" TEXT,
    "insightJson" JSONB NOT NULL,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_audiences_segmentId_idx" ON "brand_audiences"("segmentId");

-- CreateIndex
CREATE INDEX "customer_feedback_source_idx" ON "customer_feedback"("source");

-- CreateIndex
CREATE INDEX "customer_feedback_sentiment_idx" ON "customer_feedback"("sentiment");

-- CreateIndex
CREATE INDEX "customer_feedback_brandId_idx" ON "customer_feedback"("brandId");

-- CreateIndex
CREATE INDEX "customer_feedback_productId_idx" ON "customer_feedback"("productId");

-- CreateIndex
CREATE INDEX "ideation_runs_mode_idx" ON "ideation_runs"("mode");

-- CreateIndex
CREATE INDEX "ideation_runs_brandId_idx" ON "ideation_runs"("brandId");

-- CreateIndex
CREATE INDEX "content_insights_scope_idx" ON "content_insights"("scope");

-- AddForeignKey
ALTER TABLE "brand_audiences" ADD CONSTRAINT "brand_audiences_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_audiences" ADD CONSTRAINT "brand_audiences_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "audience_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
