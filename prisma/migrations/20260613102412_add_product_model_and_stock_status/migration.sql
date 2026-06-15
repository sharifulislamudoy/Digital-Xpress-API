-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('IN_STOCK', 'LIMITED_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'PRE_ORDER', 'COMING_SOON');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "modelName" TEXT,
ADD COLUMN     "stockStatus" "StockStatus" NOT NULL DEFAULT 'IN_STOCK';

-- CreateIndex
CREATE INDEX "Product_stockStatus_idx" ON "Product"("stockStatus");
