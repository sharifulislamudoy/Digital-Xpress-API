/*
  Warnings:

  - You are about to drop the `ProductVariant` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Sale` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SaleItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SaleItemBatch` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StockBatch` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('single', 'combo');

-- DropForeignKey
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_productId_fkey";

-- DropForeignKey
ALTER TABLE "SaleItem" DROP CONSTRAINT "SaleItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "SaleItem" DROP CONSTRAINT "SaleItem_saleId_fkey";

-- DropForeignKey
ALTER TABLE "SaleItem" DROP CONSTRAINT "SaleItem_variantId_fkey";

-- DropForeignKey
ALTER TABLE "SaleItemBatch" DROP CONSTRAINT "SaleItemBatch_saleItemId_fkey";

-- DropForeignKey
ALTER TABLE "SaleItemBatch" DROP CONSTRAINT "SaleItemBatch_stockBatchId_fkey";

-- DropForeignKey
ALTER TABLE "StockBatch" DROP CONSTRAINT "StockBatch_productId_fkey";

-- DropForeignKey
ALTER TABLE "StockBatch" DROP CONSTRAINT "StockBatch_variantId_fkey";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "productType" "ProductType" NOT NULL DEFAULT 'single',
ALTER COLUMN "costPrice" DROP NOT NULL,
ALTER COLUMN "profitValue" DROP NOT NULL;

-- DropTable
DROP TABLE "ProductVariant";

-- DropTable
DROP TABLE "Sale";

-- DropTable
DROP TABLE "SaleItem";

-- DropTable
DROP TABLE "SaleItemBatch";

-- DropTable
DROP TABLE "StockBatch";

-- CreateTable
CREATE TABLE "SizeChart" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'inch',
    "chartData" JSONB NOT NULL,
    "imageUrl" TEXT,
    "cloudinaryPublicId" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SizeChart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SizeChart_productId_key" ON "SizeChart"("productId");

-- CreateIndex
CREATE INDEX "SizeChart_productId_idx" ON "SizeChart"("productId");

-- CreateIndex
CREATE INDEX "SizeChart_isActive_idx" ON "SizeChart"("isActive");

-- CreateIndex
CREATE INDEX "SizeChart_sortOrder_idx" ON "SizeChart"("sortOrder");

-- CreateIndex
CREATE INDEX "Product_productType_idx" ON "Product"("productType");

-- AddForeignKey
ALTER TABLE "SizeChart" ADD CONSTRAINT "SizeChart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
