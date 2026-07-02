-- CreateEnum
CREATE TYPE "OfferCampaignType" AS ENUM ('HOT_DEAL', 'FLASH_SALE', 'ELEVEN_ELEVEN', 'EID_OFFER', 'CLEARANCE_SALE', 'FESTIVAL_OFFER');

-- CreateEnum
CREATE TYPE "OfferDiscountType" AS ENUM ('PERCENTAGE', 'FIXED', 'PRICE_OVERRIDE');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "campaignDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "campaignDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "campaignDiscountType" "OfferDiscountType",
ADD COLUMN     "campaignDiscountValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "campaignProductId" TEXT,
ADD COLUMN     "campaignTitle" TEXT,
ADD COLUMN     "campaignType" "OfferCampaignType",
ADD COLUMN     "finalUnitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "regularUnitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OfferCampaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "OfferCampaignType" NOT NULL,
    "description" TEXT,
    "bannerImageUrl" TEXT,
    "bannerCloudinaryPublicId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "allowCouponStacking" BOOLEAN NOT NULL DEFAULT false,
    "showOnHome" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferCampaignProduct" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "discountType" "OfferDiscountType" NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "campaignStock" INTEGER,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "maxQtyPerOrder" INTEGER,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferCampaignProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfferCampaign_slug_key" ON "OfferCampaign"("slug");

-- CreateIndex
CREATE INDEX "OfferCampaign_slug_idx" ON "OfferCampaign"("slug");

-- CreateIndex
CREATE INDEX "OfferCampaign_type_idx" ON "OfferCampaign"("type");

-- CreateIndex
CREATE INDEX "OfferCampaign_isPublished_idx" ON "OfferCampaign"("isPublished");

-- CreateIndex
CREATE INDEX "OfferCampaign_startsAt_idx" ON "OfferCampaign"("startsAt");

-- CreateIndex
CREATE INDEX "OfferCampaign_endsAt_idx" ON "OfferCampaign"("endsAt");

-- CreateIndex
CREATE INDEX "OfferCampaign_priority_idx" ON "OfferCampaign"("priority");

-- CreateIndex
CREATE INDEX "OfferCampaignProduct_campaignId_idx" ON "OfferCampaignProduct"("campaignId");

-- CreateIndex
CREATE INDEX "OfferCampaignProduct_productId_idx" ON "OfferCampaignProduct"("productId");

-- CreateIndex
CREATE INDEX "OfferCampaignProduct_isPublished_idx" ON "OfferCampaignProduct"("isPublished");

-- CreateIndex
CREATE INDEX "OfferCampaignProduct_sortOrder_idx" ON "OfferCampaignProduct"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "OfferCampaignProduct_campaignId_productId_key" ON "OfferCampaignProduct"("campaignId", "productId");

-- CreateIndex
CREATE INDEX "OrderItem_campaignId_idx" ON "OrderItem"("campaignId");

-- CreateIndex
CREATE INDEX "OrderItem_campaignProductId_idx" ON "OrderItem"("campaignProductId");

-- AddForeignKey
ALTER TABLE "OfferCampaign" ADD CONSTRAINT "OfferCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferCampaignProduct" ADD CONSTRAINT "OfferCampaignProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "OfferCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferCampaignProduct" ADD CONSTRAINT "OfferCampaignProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
