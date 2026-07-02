/*
  Warnings:

  - The values [CAMPAIGN_11_11,EID_OFFER,CLEARANCE_SALE] on the enum `CampaignType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `bannerCloudinaryPublicId` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `allowCouponStacking` on the `CampaignProduct` table. All the data in the column will be lost.
  - You are about to drop the column `campaignStock` on the `CampaignProduct` table. All the data in the column will be lost.
  - You are about to drop the column `discountType` on the `CampaignProduct` table. All the data in the column will be lost.
  - You are about to drop the column `discountValue` on the `CampaignProduct` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `CampaignProduct` table. All the data in the column will be lost.
  - You are about to drop the column `maxQuantityPerOrder` on the `CampaignProduct` table. All the data in the column will be lost.
  - You are about to drop the column `soldCount` on the `CampaignProduct` table. All the data in the column will be lost.
  - Added the required column `discountValue` to the `Campaign` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CampaignScope" AS ENUM ('ALL_PRODUCTS', 'CATEGORY', 'SUBCATEGORY', 'SPECIFIC_PRODUCTS');

-- AlterEnum
BEGIN;
CREATE TYPE "CampaignType_new" AS ENUM ('HOT_DEAL', 'FLASH_SALE', 'CUSTOM', 'CLEARANCE', 'SEASONAL');
ALTER TABLE "public"."Campaign" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Campaign" ALTER COLUMN "type" TYPE "CampaignType_new" USING ("type"::text::"CampaignType_new");
ALTER TYPE "CampaignType" RENAME TO "CampaignType_old";
ALTER TYPE "CampaignType_new" RENAME TO "CampaignType";
DROP TYPE "public"."CampaignType_old";
ALTER TABLE "Campaign" ALTER COLUMN "type" SET DEFAULT 'CUSTOM';
COMMIT;

-- DropIndex
DROP INDEX "CampaignProduct_isActive_idx";

-- AlterTable
ALTER TABLE "Campaign" DROP COLUMN "bannerCloudinaryPublicId",
ADD COLUMN     "badgeText" TEXT,
ADD COLUMN     "bannerCloudinaryId" TEXT,
ADD COLUMN     "brandId" TEXT,
ADD COLUMN     "cardCloudinaryId" TEXT,
ADD COLUMN     "cardImageUrl" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "createdByEmail" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "createdByName" TEXT,
ADD COLUMN     "discountType" "CampaignDiscountType" NOT NULL DEFAULT 'PERCENTAGE',
ADD COLUMN     "discountValue" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "scope" "CampaignScope" NOT NULL DEFAULT 'SPECIFIC_PRODUCTS',
ADD COLUMN     "showOnHome" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subCategoryId" TEXT,
ALTER COLUMN "startsAt" DROP NOT NULL,
ALTER COLUMN "endsAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CampaignProduct" DROP COLUMN "allowCouponStacking",
DROP COLUMN "campaignStock",
DROP COLUMN "discountType",
DROP COLUMN "discountValue",
DROP COLUMN "isActive",
DROP COLUMN "maxQuantityPerOrder",
DROP COLUMN "soldCount",
ADD COLUMN     "customDiscountType" "CampaignDiscountType",
ADD COLUMN     "customDiscountValue" DECIMAL(12,2),
ADD COLUMN     "customOfferPrice" DECIMAL(12,2),
ADD COLUMN     "offerStockLimit" INTEGER,
ADD COLUMN     "soldQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "campaignDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "campaignsUsed" JSONB;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "campaignDiscountType" "CampaignDiscountType",
ADD COLUMN     "campaignDiscountValue" DECIMAL(12,2),
ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "campaignTitle" TEXT,
ADD COLUMN     "lineCampaignDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "unitCampaignDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "unitCampaignPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "unitSellingPriceBeforeCampaign" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "soldQuantity" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Campaign_scope_idx" ON "Campaign"("scope");

-- CreateIndex
CREATE INDEX "Campaign_categoryId_idx" ON "Campaign"("categoryId");

-- CreateIndex
CREATE INDEX "Campaign_subCategoryId_idx" ON "Campaign"("subCategoryId");

-- CreateIndex
CREATE INDEX "Campaign_isPublished_idx" ON "Campaign"("isPublished");

-- CreateIndex
CREATE INDEX "Campaign_showOnHome_idx" ON "Campaign"("showOnHome");

-- CreateIndex
CREATE INDEX "Campaign_sortOrder_idx" ON "Campaign"("sortOrder");

-- CreateIndex
CREATE INDEX "CampaignProduct_sortOrder_idx" ON "CampaignProduct"("sortOrder");

-- CreateIndex
CREATE INDEX "OrderItem_campaignId_idx" ON "OrderItem"("campaignId");

-- CreateIndex
CREATE INDEX "Product_soldQuantity_idx" ON "Product"("soldQuantity");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_subCategoryId_fkey" FOREIGN KEY ("subCategoryId") REFERENCES "ProductSubCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
