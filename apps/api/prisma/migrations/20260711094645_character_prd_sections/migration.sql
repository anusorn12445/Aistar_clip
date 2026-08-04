-- CreateTable
CREATE TABLE "character_relationships" (
    "id" UUID NOT NULL,
    "fromCharacterId" UUID NOT NULL,
    "toCharacterId" UUID NOT NULL,
    "relationType" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_wardrobes" (
    "id" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "occasion" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_wardrobes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_expressions" (
    "id" UUID NOT NULL,
    "characterId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_expressions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "character_relationships_fromCharacterId_idx" ON "character_relationships"("fromCharacterId");

-- CreateIndex
CREATE INDEX "character_relationships_toCharacterId_idx" ON "character_relationships"("toCharacterId");

-- CreateIndex
CREATE INDEX "character_wardrobes_characterId_idx" ON "character_wardrobes"("characterId");

-- CreateIndex
CREATE INDEX "character_expressions_characterId_idx" ON "character_expressions"("characterId");

-- AddForeignKey
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_fromCharacterId_fkey" FOREIGN KEY ("fromCharacterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_toCharacterId_fkey" FOREIGN KEY ("toCharacterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_wardrobes" ADD CONSTRAINT "character_wardrobes_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_expressions" ADD CONSTRAINT "character_expressions_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
