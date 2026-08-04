-- AlterTable
ALTER TABLE "series" ADD COLUMN     "bible" JSONB,
ADD COLUMN     "broadcastSchedule" JSONB,
ADD COLUMN     "coverAssetId" UUID,
ADD COLUMN     "premise" TEXT;

-- CreateTable
CREATE TABLE "series_characters" (
    "seriesId" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'main',

    CONSTRAINT "series_characters_pkey" PRIMARY KEY ("seriesId","characterId")
);

-- CreateTable
CREATE TABLE "series_locations" (
    "seriesId" UUID NOT NULL,
    "locationId" UUID NOT NULL,

    CONSTRAINT "series_locations_pkey" PRIMARY KEY ("seriesId","locationId")
);

-- CreateTable
CREATE TABLE "series_seasons" (
    "id" UUID NOT NULL,
    "seriesId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "arc" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "series_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_products" (
    "seasonId" UUID NOT NULL,
    "productId" UUID NOT NULL,

    CONSTRAINT "season_products_pkey" PRIMARY KEY ("seasonId","productId")
);

-- CreateIndex
CREATE UNIQUE INDEX "series_seasons_seriesId_label_key" ON "series_seasons"("seriesId", "label");

-- AddForeignKey
ALTER TABLE "series_characters" ADD CONSTRAINT "series_characters_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_locations" ADD CONSTRAINT "series_locations_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_seasons" ADD CONSTRAINT "series_seasons_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_products" ADD CONSTRAINT "season_products_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "series_seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
