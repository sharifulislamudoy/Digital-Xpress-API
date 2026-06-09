/*
  Warnings:

  - You are about to drop the column `unbannedAt` on the `BannedUser` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "BannedUser" DROP COLUMN "unbannedAt",
ADD COLUMN     "bannedBy" TEXT,
ALTER COLUMN "reason" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isBanned" BOOLEAN NOT NULL DEFAULT false;
