-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('PURCHASE', 'SALE', 'CANCEL_RESTORE', 'RETURN_RESTORE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'LOSS');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "actualCourierCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "grossProfit" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "inventoryRestoredAt" TIMESTAMP(3),
ADD COLUMN     "netProfit" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "packagingCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "productCostTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "costBreakdown" JSONB,
ADD COLUMN     "profit" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "unitCostPrice" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "averageCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lastPurchaseCost" DECIMAL(12,2),
ADD COLUMN     "stockValue" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "InventoryBatch" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "purchaseQuantity" INTEGER NOT NULL,
    "remainingQuantity" INTEGER NOT NULL,
    "unitCostPrice" DECIMAL(12,2) NOT NULL,
    "mrp" DECIMAL(12,2),
    "sellingPrice" DECIMAL(12,2),
    "totalCost" DECIMAL(12,2) NOT NULL,
    "supplierName" TEXT,
    "supplierPhone" TEXT,
    "supplierInvoiceNumber" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostPrice" DECIMAL(12,2),
    "totalCost" DECIMAL(12,2),
    "reason" TEXT,
    "referenceType" TEXT,
    "referenceNo" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBatch_batchNo_key" ON "InventoryBatch"("batchNo");

-- CreateIndex
CREATE INDEX "InventoryBatch_productId_idx" ON "InventoryBatch"("productId");

-- CreateIndex
CREATE INDEX "InventoryBatch_batchNo_idx" ON "InventoryBatch"("batchNo");

-- CreateIndex
CREATE INDEX "InventoryBatch_purchaseDate_idx" ON "InventoryBatch"("purchaseDate");

-- CreateIndex
CREATE INDEX "InventoryBatch_remainingQuantity_idx" ON "InventoryBatch"("remainingQuantity");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_idx" ON "InventoryMovement"("productId");

-- CreateIndex
CREATE INDEX "InventoryMovement_batchId_idx" ON "InventoryMovement"("batchId");

-- CreateIndex
CREATE INDEX "InventoryMovement_type_idx" ON "InventoryMovement"("type");

-- CreateIndex
CREATE INDEX "InventoryMovement_referenceNo_idx" ON "InventoryMovement"("referenceNo");

-- CreateIndex
CREATE INDEX "InventoryMovement_createdAt_idx" ON "InventoryMovement"("createdAt");

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
