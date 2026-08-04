-- CreateTable
CREATE TABLE "character_categories" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_category_links" (
    "characterId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,

    CONSTRAINT "character_category_links_pkey" PRIMARY KEY ("characterId","categoryId")
);

-- CreateIndex
CREATE UNIQUE INDEX "character_categories_key_key" ON "character_categories"("key");

-- CreateIndex
CREATE INDEX "character_category_links_categoryId_idx" ON "character_category_links"("categoryId");

-- AddForeignKey
ALTER TABLE "character_category_links" ADD CONSTRAINT "character_category_links_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_category_links" ADD CONSTRAINT "character_category_links_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "character_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
