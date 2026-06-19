/*
  Warnings:

  - A unique constraint covering the columns `[sku]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[productCode]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[barcode]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "logoCloudinaryId" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "seoTitle" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "averageRating" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "canonicalUrl" TEXT,
ADD COLUMN     "cartCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cashOnDelivery" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "createdByEmail" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "createdByName" TEXT,
ADD COLUMN     "deliveryCharge" DECIMAL(12,2),
ADD COLUMN     "deliveryInfo" TEXT,
ADD COLUMN     "deliveryTime" TEXT,
ADD COLUMN     "focusKeyword" TEXT,
ADD COLUMN     "freeDelivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "freeDeliveryMinAmount" DECIMAL(12,2),
ADD COLUMN     "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "hoverImageAlt" TEXT,
ADD COLUMN     "insideDhakaDeliveryCharge" DECIMAL(12,2),
ADD COLUMN     "internalNote" TEXT,
ADD COLUMN     "isBestSeller" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isFlashSale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isNewArrival" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isRecommended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isTrending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "keyFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lowStockAlertQuantity" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "mainImageAlt" TEXT,
ADD COLUMN     "metaRobots" TEXT NOT NULL DEFAULT 'index,follow',
ADD COLUMN     "ogDescription" TEXT,
ADD COLUMN     "ogImage" TEXT,
ADD COLUMN     "ogTitle" TEXT,
ADD COLUMN     "orderCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "outsideDhakaDeliveryCharge" DECIMAL(12,2),
ADD COLUMN     "packageDimensions" TEXT,
ADD COLUMN     "packageIncludes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "packageWeight" TEXT,
ADD COLUMN     "productCode" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "refundPolicy" TEXT,
ADD COLUMN     "replacementPolicy" TEXT,
ADD COLUMN     "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "returnPolicy" TEXT,
ADD COLUMN     "schemaJson" JSONB,
ADD COLUMN     "searchKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "seoTitle" TEXT,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "soldQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "specifications" JSONB,
ADD COLUMN     "supplierAddress" TEXT,
ADD COLUMN     "supplierEmail" TEXT,
ADD COLUMN     "supplierInvoiceNumber" TEXT,
ADD COLUMN     "supplierName" TEXT,
ADD COLUMN     "supplierPhone" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totalReviews" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedByEmail" TEXT,
ADD COLUMN     "updatedById" TEXT,
ADD COLUMN     "updatedByName" TEXT,
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "warrantyDetails" TEXT,
ADD COLUMN     "warrantyDuration" TEXT,
ADD COLUMN     "wishlistCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProductCategory" ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "seoTitle" TEXT;

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "altText" TEXT;

-- AlterTable
ALTER TABLE "ProductSubCategory" ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "seoTitle" TEXT;

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT,
    "color" TEXT,
    "size" TEXT,
    "ram" TEXT,
    "storage" TEXT,
    "mrp" DECIMAL(12,2),
    "costPrice" DECIMAL(12,2),
    "profitType" "ProfitType" NOT NULL DEFAULT 'PERCENTAGE',
    "profitValue" DECIMAL(12,2),
    "sellingPrice" DECIMAL(12,2),
    "stock" INTEGER NOT NULL DEFAULT 0,
    "stockStatus" "StockStatus" NOT NULL DEFAULT 'IN_STOCK',
    "imageUrl" TEXT,
    "imagePublicId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "ProductVariant_sku_idx" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_stockStatus_idx" ON "ProductVariant"("stockStatus");

-- CreateIndex
CREATE INDEX "ProductVariant_isActive_idx" ON "ProductVariant"("isActive");

-- CreateIndex
CREATE INDEX "Brand_slug_idx" ON "Brand"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_productCode_key" ON "Product"("productCode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_isFeatured_idx" ON "Product"("isFeatured");

-- CreateIndex
CREATE INDEX "Product_isNewArrival_idx" ON "Product"("isNewArrival");

-- CreateIndex
CREATE INDEX "Product_isBestSeller_idx" ON "Product"("isBestSeller");

-- CreateIndex
CREATE INDEX "Product_createdAt_idx" ON "Product"("createdAt");

-- CreateIndex
CREATE INDEX "Product_updatedAt_idx" ON "Product"("updatedAt");

-- CreateIndex
CREATE INDEX "Product_slug_idx" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "ProductCategory_slug_idx" ON "ProductCategory"("slug");

-- CreateIndex
CREATE INDEX "ProductImage_sortOrder_idx" ON "ProductImage"("sortOrder");

-- CreateIndex
CREATE INDEX "ProductSubCategory_slug_idx" ON "ProductSubCategory"("slug");

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
