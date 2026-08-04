-- CreateTable
CREATE TABLE "character_products" (
    "characterId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "note" TEXT,

    CONSTRAINT "character_products_pkey" PRIMARY KEY ("characterId","productId")
);

-- CreateTable
CREATE TABLE "series_products" (
    "seriesId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "note" TEXT,

    CONSTRAINT "series_products_pkey" PRIMARY KEY ("seriesId","productId")
);

-- CreateTable
CREATE TABLE "location_products" (
    "locationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "note" TEXT,

    CONSTRAINT "location_products_pkey" PRIMARY KEY ("locationId","productId")
);

-- CreateIndex
CREATE INDEX "character_products_productId_idx" ON "character_products"("productId");

-- CreateIndex
CREATE INDEX "series_products_productId_idx" ON "series_products"("productId");

-- CreateIndex
CREATE INDEX "location_products_productId_idx" ON "location_products"("productId");

-- AddForeignKey
ALTER TABLE "character_products" ADD CONSTRAINT "character_products_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_products" ADD CONSTRAINT "character_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_products" ADD CONSTRAINT "series_products_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_products" ADD CONSTRAINT "series_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_products" ADD CONSTRAINT "location_products_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_products" ADD CONSTRAINT "location_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
