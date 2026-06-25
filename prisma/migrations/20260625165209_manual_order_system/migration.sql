/*
  Warnings:

  - You are about to drop the column `courierAddedAt` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `steadfastConsignmentId` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `steadfastResponse` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `steadfastStatus` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `steadfastTrackingCode` on the `Order` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Order" DROP COLUMN "courierAddedAt",
DROP COLUMN "steadfastConsignmentId",
DROP COLUMN "steadfastResponse",
DROP COLUMN "steadfastStatus",
DROP COLUMN "steadfastTrackingCode",
ADD COLUMN     "courierAssignedAt" TIMESTAMP(3),
ADD COLUMN     "courierName" TEXT,
ADD COLUMN     "courierNote" TEXT,
ADD COLUMN     "courierTrackingNumber" TEXT,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "returnedAt" TIMESTAMP(3),
ADD COLUMN     "shippedAt" TIMESTAMP(3);
