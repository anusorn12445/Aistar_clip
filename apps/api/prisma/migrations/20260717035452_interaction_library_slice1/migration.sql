-- CreateTable
CREATE TABLE "hand_profiles" (
    "id" UUID NOT NULL,
    "displayCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "gender" TEXT,
    "ageGroup" TEXT,
    "skinTone" TEXT,
    "handSize" TEXT,
    "fingerLength" TEXT,
    "nailLength" TEXT,
    "nailShape" TEXT,
    "nailColor" TEXT,
    "nailStyle" TEXT,
    "accessories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sleeveStyle" TEXT,
    "skinTexture" TEXT,
    "dominantHand" TEXT,
    "allowedGestures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "restrictedGestures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productCategorySuitability" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isChild" BOOLEAN NOT NULL DEFAULT false,
    "policyFlag" TEXT,
    "complianceReviewed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "hand_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gestures" (
    "id" UUID NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "naturalDurationSec" DOUBLE PRECISION,
    "minDurationSec" DOUBLE PRECISION,
    "maxDurationSec" DOUBLE PRECISION,
    "minSpeedMultiplier" DOUBLE PRECISION,
    "maxSpeedMultiplier" DOUBLE PRECISION,
    "requiredHandCount" INTEGER,
    "requiredProductState" TEXT,
    "resultingProductState" TEXT,
    "compatiblePackaging" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "compatibleMaterial" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "promptTemplate" TEXT,
    "negativePrompt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "gestures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_states" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isInitial" BOOLEAN NOT NULL DEFAULT false,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_state_transitions" (
    "id" UUID NOT NULL,
    "fromStateId" UUID NOT NULL,
    "toStateId" UUID NOT NULL,
    "note" TEXT,

    CONSTRAINT "product_state_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hand_profiles_displayCode_key" ON "hand_profiles"("displayCode");

-- CreateIndex
CREATE INDEX "hand_profiles_category_status_idx" ON "hand_profiles"("category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gestures_key_key" ON "gestures"("key");

-- CreateIndex
CREATE INDEX "gestures_category_status_idx" ON "gestures"("category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "product_states_key_key" ON "product_states"("key");

-- CreateIndex
CREATE INDEX "product_state_transitions_toStateId_idx" ON "product_state_transitions"("toStateId");

-- CreateIndex
CREATE UNIQUE INDEX "product_state_transitions_fromStateId_toStateId_key" ON "product_state_transitions"("fromStateId", "toStateId");

-- AddForeignKey
ALTER TABLE "product_state_transitions" ADD CONSTRAINT "product_state_transitions_fromStateId_fkey" FOREIGN KEY ("fromStateId") REFERENCES "product_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_state_transitions" ADD CONSTRAINT "product_state_transitions_toStateId_fkey" FOREIGN KEY ("toStateId") REFERENCES "product_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;
