-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_key_key" ON "product_categories"("key");

-- Seed the 7 builtin categories (keys must match existing Product.category values).
-- ON CONFLICT keeps this idempotent and preserves any user-edited labels/sortOrder.
INSERT INTO "product_categories" ("id", "key", "label", "sortOrder", "status", "builtin", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'fashion',    'แฟชั่น',         0, 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'beauty',     'ความงาม',        1, 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'food',       'อาหาร',          2, 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'supplement', 'อาหารเสริม',     3, 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'home',       'ของใช้ในบ้าน',   4, 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'gadget',     'แกดเจ็ต',        5, 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'other',      'อื่นๆ',          6, 'active', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
