/*
  Warnings:

  - Added the required column `cloudinaryPublicId` to the `Banner` table without a default value. This is not possible if the table is not empty.
  - Added the required column `createdByRole` to the `Banner` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Banner" DROP CONSTRAINT "Banner_createdById_fkey";

-- DropIndex
DROP INDEX "Banner_createdById_idx";

-- AlterTable
ALTER TABLE "Banner" ADD COLUMN     "cloudinaryPublicId" TEXT NOT NULL,
ADD COLUMN     "createdByEmail" TEXT,
ADD COLUMN     "createdByName" TEXT,
ADD COLUMN     "createdByRole" "Role" NOT NULL,
ALTER COLUMN "createdById" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Banner_isPublished_idx" ON "Banner"("isPublished");

-- CreateIndex
CREATE INDEX "Banner_createdByRole_idx" ON "Banner"("createdByRole");

-- CreateIndex
CREATE INDEX "Banner_createdAt_idx" ON "Banner"("createdAt");

-- AddForeignKey
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
