-- CreateTable
CREATE TABLE "banned_words" (
    "id" UUID NOT NULL,
    "term" TEXT NOT NULL,
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "severity" TEXT NOT NULL DEFAULT 'ban',
    "category" TEXT,
    "replacement" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banned_words_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "banned_words_term_key" ON "banned_words"("term");

-- CreateIndex
CREATE INDEX "banned_words_status_idx" ON "banned_words"("status");
