-- packaging type on product (drives packaging prompt block)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "packagingType" TEXT;
