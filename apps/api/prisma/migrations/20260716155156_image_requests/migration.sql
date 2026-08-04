-- CreateTable
CREATE TABLE "image_requests" (
    "id" UUID NOT NULL,
    "displayCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageType" TEXT NOT NULL,
    "platform" TEXT,
    "sizeNote" TEXT,
    "copyText" TEXT,
    "brief" TEXT,
    "brandId" UUID,
    "entityType" TEXT,
    "entityId" UUID,
    "draftPrompt" TEXT,
    "requesterId" UUID NOT NULL,
    "assigneeId" UUID,
    "dueAt" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "approvedAssetId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "image_requests_displayCode_key" ON "image_requests"("displayCode");

-- CreateIndex
CREATE INDEX "image_requests_status_assigneeId_idx" ON "image_requests"("status", "assigneeId");

-- CreateIndex
CREATE INDEX "image_requests_entityType_entityId_idx" ON "image_requests"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "image_requests_requesterId_idx" ON "image_requests"("requesterId");
