/*
  Warnings:

  - You are about to drop the column `profitType` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `profitValue` on the `Product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Product" DROP COLUMN "profitType",
DROP COLUMN "profitValue";

-- DropEnum
DROP TYPE "ProfitType";
