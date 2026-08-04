-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('brief', 'planning', 'production', 'review', 'published', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "EpisodeStatus" AS ENUM ('idea', 'script_draft', 'script_review', 'script_approved', 'shot_breakdown', 'production', 'edited', 'published', 'archived');

-- CreateEnum
CREATE TYPE "ShotStatus" AS ENUM ('planned', 'prompt_ready', 'generating', 'generated', 'selected', 'rejected', 'edited', 'approved');

-- CreateEnum
CREATE TYPE "LegalStatus" AS ENUM ('draft', 'internal_only', 'commercial_approved', 'restricted', 'expired', 'archived');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('idea', 'brief', 'in_production', 'internal_review', 'revision_needed', 'approved', 'scheduled', 'published', 'archived');

-- CreateEnum
CREATE TYPE "LiveStatus" AS ENUM ('scheduled', 'live', 'done', 'cancelled');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('captured', 'reviewed', 'shortlisted', 'adapted', 'converted', 'used', 'archived');

-- CreateEnum
CREATE TYPE "PostitStatus" AS ENUM ('open', 'in_progress', 'resolved', 'archived');

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "displayCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandId" UUID,
    "category" TEXT,
    "description" TEXT,
    "price" DECIMAL(12,2),
    "salePrice" DECIMAL(12,2),
    "platformLinks" JSONB,
    "claimRiskLevel" TEXT NOT NULL DEFAULT 'low',
    "restrictedClaims" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "commissionNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "ownerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "displayCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientBrand" TEXT,
    "objective" TEXT,
    "campaignType" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "targetKpi" JSONB,
    "ownerId" UUID,
    "status" "CampaignStatus" NOT NULL DEFAULT 'brief',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_characters" (
    "campaignId" UUID NOT NULL,
    "characterId" UUID NOT NULL,

    CONSTRAINT "campaign_characters_pkey" PRIMARY KEY ("campaignId","characterId")
);

-- CreateTable
CREATE TABLE "campaign_products" (
    "campaignId" UUID NOT NULL,
    "productId" UUID NOT NULL,

    CONSTRAINT "campaign_products_pkey" PRIMARY KEY ("campaignId","productId")
);

-- CreateTable
CREATE TABLE "series" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "universe" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episodes" (
    "id" UUID NOT NULL,
    "displayCode" TEXT NOT NULL,
    "seriesId" UUID,
    "season" TEXT,
    "episodeNumber" INTEGER,
    "title" TEXT NOT NULL,
    "logline" TEXT,
    "script" TEXT,
    "hook" TEXT,
    "conflict" TEXT,
    "twist" TEXT,
    "cta" TEXT,
    "locationId" UUID,
    "campaignId" UUID,
    "status" "EpisodeStatus" NOT NULL DEFAULT 'idea',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episode_characters" (
    "episodeId" UUID NOT NULL,
    "characterId" UUID NOT NULL,

    CONSTRAINT "episode_characters_pkey" PRIMARY KEY ("episodeId","characterId")
);

-- CreateTable
CREATE TABLE "episode_products" (
    "episodeId" UUID NOT NULL,
    "productId" UUID NOT NULL,

    CONSTRAINT "episode_products_pkey" PRIMARY KEY ("episodeId","productId")
);

-- CreateTable
CREATE TABLE "shots" (
    "id" UUID NOT NULL,
    "episodeId" UUID NOT NULL,
    "shotNumber" INTEGER NOT NULL,
    "durationSec" INTEGER,
    "camera" TEXT,
    "action" TEXT,
    "dialogue" TEXT,
    "emotion" TEXT,
    "locationId" UUID,
    "outfit" TEXT,
    "status" "ShotStatus" NOT NULL DEFAULT 'planned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shot_characters" (
    "shotId" UUID NOT NULL,
    "characterId" UUID NOT NULL,

    CONSTRAINT "shot_characters_pkey" PRIMARY KEY ("shotId","characterId")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "regionStyle" TEXT,
    "mood" TEXT,
    "lighting" TEXT,
    "timeOfDay" TEXT,
    "prompt" TEXT,
    "negativePrompt" TEXT,
    "continuityNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_voice_profiles" (
    "id" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "voiceType" TEXT,
    "tone" TEXT,
    "accent" TEXT,
    "speakingSpeed" TEXT,
    "laughStyle" TEXT,
    "emotionalRange" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sampleDialogues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiVoiceModel" TEXT,
    "humanVoiceActor" TEXT,
    "usageRights" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_voice_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rights" (
    "id" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "owner" TEXT NOT NULL,
    "commercialUsage" BOOLEAN NOT NULL DEFAULT false,
    "usageScope" TEXT,
    "territory" TEXT,
    "duration" TEXT,
    "exclusivity" TEXT,
    "restrictedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disclosureRequired" BOOLEAN NOT NULL DEFAULT false,
    "legalStatus" "LegalStatus" NOT NULL DEFAULT 'draft',
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_reviews" (
    "id" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "reviewerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qc_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "platform" TEXT NOT NULL,
    "account" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "contentFormat" TEXT,
    "contentType" TEXT,
    "episodeId" UUID,
    "campaignId" UUID,
    "caption" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cta" TEXT,
    "thumbnailAssetId" UUID,
    "postUrl" TEXT,
    "blockedReason" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'idea',
    "ownerId" UUID,
    "reviewerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_item_characters" (
    "contentItemId" UUID NOT NULL,
    "characterId" UUID NOT NULL,

    CONSTRAINT "content_item_characters_pkey" PRIMARY KEY ("contentItemId","characterId")
);

-- CreateTable
CREATE TABLE "content_item_products" (
    "contentItemId" UUID NOT NULL,
    "productId" UUID NOT NULL,

    CONSTRAINT "content_item_products_pkey" PRIMARY KEY ("contentItemId","productId")
);

-- CreateTable
CREATE TABLE "live_sessions" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "account" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "humanOperatorId" UUID,
    "offer" TEXT,
    "script" TEXT,
    "faq" TEXT,
    "commentGuide" TEXT,
    "sceneSetup" TEXT,
    "targetGmv" DECIMAL(14,2),
    "replayAssetId" UUID,
    "status" "LiveStatus" NOT NULL DEFAULT 'scheduled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_characters" (
    "liveId" UUID NOT NULL,
    "characterId" UUID NOT NULL,

    CONSTRAINT "live_characters_pkey" PRIMARY KEY ("liveId","characterId")
);

-- CreateTable
CREATE TABLE "live_products" (
    "liveId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "pinOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "live_products_pkey" PRIMARY KEY ("liveId","productId")
);

-- CreateTable
CREATE TABLE "content_performance" (
    "id" UUID NOT NULL,
    "contentItemId" UUID,
    "liveSessionId" UUID,
    "platform" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "views" INTEGER,
    "reach" INTEGER,
    "impressions" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "watchTimeSec" INTEGER,
    "retention3Sec" DOUBLE PRECISION,
    "completionRate" DOUBLE PRECISION,
    "ctr" DOUBLE PRECISION,
    "productClicks" INTEGER,
    "addToCart" INTEGER,
    "orders" INTEGER,
    "revenue" DECIMAL(14,2),
    "gmv" DECIMAL(14,2),
    "cvr" DOUBLE PRECISION,
    "roas" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'performance_csv',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "errorRows" JSONB,
    "status" TEXT NOT NULL DEFAULT 'done',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "category" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "positioning" TEXT,
    "audience" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "strength" TEXT,
    "weakness" TEXT,
    "threatLevel" TEXT NOT NULL DEFAULT 'medium',
    "watchStatus" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_channels" (
    "id" UUID NOT NULL,
    "competitorId" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "url" TEXT,
    "followers" INTEGER,
    "notes" TEXT,

    CONSTRAINT "competitor_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_contents" (
    "id" UUID NOT NULL,
    "competitorId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "platform" TEXT,
    "contentType" TEXT,
    "hook" TEXT,
    "metricsNote" TEXT,
    "notes" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "competitor_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_insights" (
    "id" UUID NOT NULL,
    "competitorId" UUID,
    "fact" TEXT NOT NULL,
    "assumption" TEXT,
    "recommendation" TEXT,
    "convertedToCampaignId" UUID,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitor_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ideas" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "ideaType" TEXT,
    "url" TEXT,
    "note" TEXT,
    "aiSummary" TEXT,
    "aiAdaptation" TEXT,
    "screenshotAssetId" UUID,
    "status" "IdeaStatus" NOT NULL DEFAULT 'captured',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postits" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'note',
    "content" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" UUID,
    "assigneeId" UUID,
    "priority" "TaskPriority" NOT NULL DEFAULT 'normal',
    "status" "PostitStatus" NOT NULL DEFAULT 'open',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "postits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postit_comments" (
    "id" UUID NOT NULL,
    "postitId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "postit_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_displayCode_key" ON "products"("displayCode");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_displayCode_key" ON "campaigns"("displayCode");

-- CreateIndex
CREATE UNIQUE INDEX "episodes_displayCode_key" ON "episodes"("displayCode");

-- CreateIndex
CREATE INDEX "shots_episodeId_shotNumber_idx" ON "shots"("episodeId", "shotNumber");

-- CreateIndex
CREATE INDEX "character_voice_profiles_characterId_idx" ON "character_voice_profiles"("characterId");

-- CreateIndex
CREATE INDEX "rights_entityType_entityId_idx" ON "rights"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "qc_reviews_entityType_entityId_idx" ON "qc_reviews"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "content_items_platform_scheduledAt_idx" ON "content_items"("platform", "scheduledAt");

-- CreateIndex
CREATE INDEX "live_sessions_scheduledAt_idx" ON "live_sessions"("scheduledAt");

-- CreateIndex
CREATE INDEX "content_performance_contentItemId_recordedAt_idx" ON "content_performance"("contentItemId", "recordedAt");

-- CreateIndex
CREATE INDEX "postits_entityType_entityId_idx" ON "postits"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_characters" ADD CONSTRAINT "campaign_characters_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_products" ADD CONSTRAINT "campaign_products_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_products" ADD CONSTRAINT "campaign_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_characters" ADD CONSTRAINT "episode_characters_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_products" ADD CONSTRAINT "episode_products_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_products" ADD CONSTRAINT "episode_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shots" ADD CONSTRAINT "shots_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shot_characters" ADD CONSTRAINT "shot_characters_shotId_fkey" FOREIGN KEY ("shotId") REFERENCES "shots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_item_characters" ADD CONSTRAINT "content_item_characters_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_item_products" ADD CONSTRAINT "content_item_products_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_item_products" ADD CONSTRAINT "content_item_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_characters" ADD CONSTRAINT "live_characters_liveId_fkey" FOREIGN KEY ("liveId") REFERENCES "live_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_products" ADD CONSTRAINT "live_products_liveId_fkey" FOREIGN KEY ("liveId") REFERENCES "live_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_products" ADD CONSTRAINT "live_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_performance" ADD CONSTRAINT "content_performance_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_performance" ADD CONSTRAINT "content_performance_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "live_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_channels" ADD CONSTRAINT "competitor_channels_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_contents" ADD CONSTRAINT "competitor_contents_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_insights" ADD CONSTRAINT "competitor_insights_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postit_comments" ADD CONSTRAINT "postit_comments_postitId_fkey" FOREIGN KEY ("postitId") REFERENCES "postits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
