-- CreateTable
CREATE TABLE "ai_tools" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "defaultRateBaht" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'active',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_credit_topups" (
    "id" UUID NOT NULL,
    "aiToolId" UUID NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "amountBaht" DECIMAL(65,30) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_credit_topups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "aiToolId" UUID NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "costBaht" DECIMAL(65,30) NOT NULL,
    "outputsCount" INTEGER NOT NULL,
    "outputType" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_links" (
    "id" UUID NOT NULL,
    "usageLogId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "label" TEXT,

    CONSTRAINT "ai_usage_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_credit_topups_aiToolId_purchasedAt_idx" ON "ai_credit_topups"("aiToolId", "purchasedAt");

-- CreateIndex
CREATE INDEX "ai_usage_logs_userId_usedAt_idx" ON "ai_usage_logs"("userId", "usedAt");

-- CreateIndex
CREATE INDEX "ai_usage_logs_aiToolId_idx" ON "ai_usage_logs"("aiToolId");

-- CreateIndex
CREATE INDEX "ai_usage_links_usageLogId_idx" ON "ai_usage_links"("usageLogId");

-- CreateIndex
CREATE INDEX "ai_usage_links_entityType_entityId_idx" ON "ai_usage_links"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "ai_credit_topups" ADD CONSTRAINT "ai_credit_topups_aiToolId_fkey" FOREIGN KEY ("aiToolId") REFERENCES "ai_tools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_aiToolId_fkey" FOREIGN KEY ("aiToolId") REFERENCES "ai_tools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_links" ADD CONSTRAINT "ai_usage_links_usageLogId_fkey" FOREIGN KEY ("usageLogId") REFERENCES "ai_usage_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
