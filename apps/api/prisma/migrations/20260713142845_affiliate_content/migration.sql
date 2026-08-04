-- AlterTable
ALTER TABLE "content_items" ADD COLUMN     "affiliateUrlSnapshot" TEXT,
ADD COLUMN     "hook" TEXT,
ADD COLUMN     "productId" UUID,
ADD COLUMN     "scriptJson" JSONB,
ADD COLUMN     "sourceType" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "affiliatePlatform" TEXT,
ADD COLUMN     "affiliateUrl" TEXT,
ADD COLUMN     "commissionPct" DOUBLE PRECISION,
ADD COLUMN     "isAffiliate" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "content_items_productId_sourceType_idx" ON "content_items"("productId", "sourceType");

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
