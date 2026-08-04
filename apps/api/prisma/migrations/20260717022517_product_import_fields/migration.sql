-- AlterTable
ALTER TABLE "products" ADD COLUMN     "externalItemId" TEXT,
ADD COLUMN     "externalShopId" TEXT,
ADD COLUMN     "importedAt" TIMESTAMP(3),
ADD COLUMN     "rating" DOUBLE PRECISION,
ADD COLUMN     "shopName" TEXT,
ADD COLUMN     "soldMonth" INTEGER,
ADD COLUMN     "soldTotal" INTEGER,
ADD COLUMN     "sourcePlatform" TEXT,
ADD COLUMN     "sourceRaw" JSONB,
ADD COLUMN     "sourceType" TEXT,
ADD COLUMN     "stockQty" INTEGER;
