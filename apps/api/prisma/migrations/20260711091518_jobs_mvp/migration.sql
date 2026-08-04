-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('image_pack', 'video_review', 'live', 'mixed');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('inquiry', 'quoted', 'confirmed', 'in_production', 'internal_qc', 'delivered', 'revision', 'approved', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "JobDeliverableStatus" AS ENUM ('pending', 'submitted', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "line" TEXT,
    "email" TEXT,
    "type" TEXT,
    "brandId" UUID,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "displayCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "type" "JobType" NOT NULL DEFAULT 'video_review',
    "brief" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'inquiry',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "dueDate" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "qtyImages" INTEGER,
    "qtyClips" INTEGER,
    "revisionsIncluded" INTEGER NOT NULL DEFAULT 1,
    "quotePrice" DECIMAL(12,2),
    "depositAmount" DECIMAL(12,2),
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "ownerId" UUID,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_products" (
    "jobId" UUID NOT NULL,
    "productId" UUID NOT NULL,

    CONSTRAINT "job_products_pkey" PRIMARY KEY ("jobId","productId")
);

-- CreateTable
CREATE TABLE "job_presenters" (
    "jobId" UUID NOT NULL,
    "characterId" UUID NOT NULL,

    CONSTRAINT "job_presenters_pkey" PRIMARY KEY ("jobId","characterId")
);

-- CreateTable
CREATE TABLE "job_crew" (
    "jobId" UUID NOT NULL,
    "creatorId" UUID NOT NULL,
    "roleNote" TEXT,

    CONSTRAINT "job_crew_pkey" PRIMARY KEY ("jobId","creatorId")
);

-- CreateTable
CREATE TABLE "job_deliverables" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT,
    "notes" TEXT,
    "status" "JobDeliverableStatus" NOT NULL DEFAULT 'pending',
    "clientFeedback" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jobs_displayCode_key" ON "jobs"("displayCode");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_products" ADD CONSTRAINT "job_products_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_products" ADD CONSTRAINT "job_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_presenters" ADD CONSTRAINT "job_presenters_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_presenters" ADD CONSTRAINT "job_presenters_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_crew" ADD CONSTRAINT "job_crew_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_crew" ADD CONSTRAINT "job_crew_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_deliverables" ADD CONSTRAINT "job_deliverables_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
