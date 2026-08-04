-- CreateTable
CREATE TABLE "kpi_goals" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'role',
    "roleKey" TEXT,
    "userId" UUID,
    "metric" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'weekly',
    "target" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kpi_goals_scope_roleKey_userId_metric_period_key" ON "kpi_goals"("scope", "roleKey", "userId", "metric", "period");
