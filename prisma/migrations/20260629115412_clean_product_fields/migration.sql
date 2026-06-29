/*
  Warnings:

  - You are about to drop the column `seoDescription` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `seoKeywords` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `seoTitle` on the `Brand` table. All the data in the column will be lost.
  - You are about to drop the column `createdByEmail` on the `InventoryBatch` table. All the data in the column will be lost.
  - You are about to drop the column `createdById` on the `InventoryBatch` table. All the data in the column will be lost.
  - You are about to drop the column `createdByName` on the `InventoryBatch` table. All the data in the column will be lost.
  - You are about to drop the column `supplierInvoiceNumber` on the `InventoryBatch` table. All the data in the column will be lost.
  - You are about to drop the column `supplierName` on the `InventoryBatch` table. All the data in the column will be lost.
  - You are about to drop the column `supplierPhone` on the `InventoryBatch` table. All the data in the column will be lost.
  - You are about to drop the column `createdByEmail` on the `InventoryMovement` table. All the data in the column will be lost.
  - You are about to drop the column `createdById` on the `InventoryMovement` table. All the data in the column will be lost.
  - You are about to drop the column `createdByName` on the `InventoryMovement` table. All the data in the column will be lost.
  - You are about to drop the column `canonicalUrl` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `cartCount` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `createdByEmail` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `createdById` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `createdByName` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `deliveryCharge` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `focusKeyword` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `freeDeliveryMinAmount` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `insideDhakaDeliveryCharge` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `internalNote` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `isNewArrival` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `metaRobots` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `ogDescription` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `ogImage` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `ogTitle` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `orderCount` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `outsideDhakaDeliveryCharge` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `productCode` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `publishedAt` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `reservedQuantity` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `schemaJson` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `seoDescription` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `seoKeywords` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `seoTitle` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `soldQuantity` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `supplierAddress` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `supplierEmail` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `supplierInvoiceNumber` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `supplierName` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `supplierPhone` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `updatedByEmail` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `updatedById` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `updatedByName` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `viewCount` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `wishlistCount` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `seoDescription` on the `ProductCategory` table. All the data in the column will be lost.
  - You are about to drop the column `seoKeywords` on the `ProductCategory` table. All the data in the column will be lost.
  - You are about to drop the column `seoTitle` on the `ProductCategory` table. All the data in the column will be lost.
  - You are about to drop the column `seoDescription` on the `ProductSubCategory` table. All the data in the column will be lost.
  - You are about to drop the column `seoKeywords` on the `ProductSubCategory` table. All the data in the column will be lost.
  - You are about to drop the column `seoTitle` on the `ProductSubCategory` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Product_isNewArrival_idx";

-- DropIndex
DROP INDEX "Product_productCode_key";

-- AlterTable
ALTER TABLE "Brand" DROP COLUMN "seoDescription",
DROP COLUMN "seoKeywords",
DROP COLUMN "seoTitle";

-- AlterTable
ALTER TABLE "InventoryBatch" DROP COLUMN "createdByEmail",
DROP COLUMN "createdById",
DROP COLUMN "createdByName",
DROP COLUMN "supplierInvoiceNumber",
DROP COLUMN "supplierName",
DROP COLUMN "supplierPhone";

-- AlterTable
ALTER TABLE "InventoryMovement" DROP COLUMN "createdByEmail",
DROP COLUMN "createdById",
DROP COLUMN "createdByName";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "canonicalUrl",
DROP COLUMN "cartCount",
DROP COLUMN "createdByEmail",
DROP COLUMN "createdById",
DROP COLUMN "createdByName",
DROP COLUMN "deliveryCharge",
DROP COLUMN "focusKeyword",
DROP COLUMN "freeDeliveryMinAmount",
DROP COLUMN "insideDhakaDeliveryCharge",
DROP COLUMN "internalNote",
DROP COLUMN "isNewArrival",
DROP COLUMN "metaRobots",
DROP COLUMN "ogDescription",
DROP COLUMN "ogImage",
DROP COLUMN "ogTitle",
DROP COLUMN "orderCount",
DROP COLUMN "outsideDhakaDeliveryCharge",
DROP COLUMN "productCode",
DROP COLUMN "publishedAt",
DROP COLUMN "reservedQuantity",
DROP COLUMN "schemaJson",
DROP COLUMN "seoDescription",
DROP COLUMN "seoKeywords",
DROP COLUMN "seoTitle",
DROP COLUMN "soldQuantity",
DROP COLUMN "supplierAddress",
DROP COLUMN "supplierEmail",
DROP COLUMN "supplierInvoiceNumber",
DROP COLUMN "supplierName",
DROP COLUMN "supplierPhone",
DROP COLUMN "updatedByEmail",
DROP COLUMN "updatedById",
DROP COLUMN "updatedByName",
DROP COLUMN "viewCount",
DROP COLUMN "wishlistCount";

-- AlterTable
ALTER TABLE "ProductCategory" DROP COLUMN "seoDescription",
DROP COLUMN "seoKeywords",
DROP COLUMN "seoTitle";

-- AlterTable
ALTER TABLE "ProductSubCategory" DROP COLUMN "seoDescription",
DROP COLUMN "seoKeywords",
DROP COLUMN "seoTitle";
