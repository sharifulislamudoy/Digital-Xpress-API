/*
  Warnings:

  - Added the required column `mrp` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "mrp" DECIMAL(12,2) NOT NULL;
