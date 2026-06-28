/*
  Warnings:

  - You are about to drop the column `iconUrl` on the `ProductCategory` table. All the data in the column will be lost.
  - You are about to drop the column `iconUrl` on the `ProductSubCategory` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ProductCategory" DROP COLUMN "iconUrl";

-- AlterTable
ALTER TABLE "ProductSubCategory" DROP COLUMN "iconUrl";
