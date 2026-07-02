/*
  Warnings:

  - You are about to drop the column `campaignDiscountAmount` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `campaignDiscountAmount` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `campaignDiscountType` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `campaignDiscountValue` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `campaignId` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `campaignProductId` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `campaignTitle` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `campaignType` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `finalUnitPrice` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `regularUnitPrice` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the `OfferCampaign` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OfferCampaignProduct` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('HOT_DEAL', 'FLASH_SALE', 'CAMPAIGN_11_11', 'EID_OFFER', 'CLEARANCE_SALE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CampaignDiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FIXED_PRICE');

-- DropForeignKey
ALTER TABLE "OfferCampaign" DROP CONSTRAINT "OfferCampaign_createdById_fkey";

-- DropForeignKey
ALTER TABLE "OfferCampaignProduct" DROP CONSTRAINT "OfferCampaignProduct_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "OfferCampaignProduct" DROP CONSTRAINT "OfferCampaignProduct_productId_fkey";

-- DropIndex
DROP INDEX "OrderItem_campaignId_idx";

-- DropIndex
DROP INDEX "OrderItem_campaignProductId_idx";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "campaignDiscountAmount";

-- AlterTable
ALTER TABLE "OrderItem" DROP COLUMN "campaignDiscountAmount",
DROP COLUMN "campaignDiscountType",
DROP COLUMN "campaignDiscountValue",
DROP COLUMN "campaignId",
DROP COLUMN "campaignProductId",
DROP COLUMN "campaignTitle",
DROP COLUMN "campaignType",
DROP COLUMN "finalUnitPrice",
DROP COLUMN "regularUnitPrice";

-- DropTable
DROP TABLE "OfferCampaign";

-- DropTable
DROP TABLE "OfferCampaignProduct";

-- DropEnum
DROP TYPE "OfferCampaignType";

-- DropEnum
DROP TYPE "OfferDiscountType";

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "CampaignType" NOT NULL DEFAULT 'CUSTOM',
    "subtitle" TEXT,
    "description" TEXT,
    "bannerImageUrl" TEXT,
    "bannerCloudinaryPublicId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignProduct" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "discountType" "CampaignDiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" DECIMAL(12,2) NOT NULL,
    "campaignStock" INTEGER,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "maxQuantityPerOrder" INTEGER,
    "allowCouponStacking" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- CreateIndex
CREATE INDEX "Campaign_slug_idx" ON "Campaign"("slug");

-- CreateIndex
CREATE INDEX "Campaign_type_idx" ON "Campaign"("type");

-- CreateIndex
CREATE INDEX "Campaign_isActive_idx" ON "Campaign"("isActive");

-- CreateIndex
CREATE INDEX "Campaign_startsAt_idx" ON "Campaign"("startsAt");

-- CreateIndex
CREATE INDEX "Campaign_endsAt_idx" ON "Campaign"("endsAt");

-- CreateIndex
CREATE INDEX "Campaign_priority_idx" ON "Campaign"("priority");

-- CreateIndex
CREATE INDEX "CampaignProduct_campaignId_idx" ON "CampaignProduct"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignProduct_productId_idx" ON "CampaignProduct"("productId");

-- CreateIndex
CREATE INDEX "CampaignProduct_isActive_idx" ON "CampaignProduct"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignProduct_campaignId_productId_key" ON "CampaignProduct"("campaignId", "productId");

-- AddForeignKey
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
