-- AlterTable
ALTER TABLE "ProductCategory" ADD COLUMN     "description" TEXT,
ADD COLUMN     "iconSvg" TEXT,
ADD COLUMN     "iconUrl" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProductSubCategory" ADD COLUMN     "description" TEXT,
ADD COLUMN     "iconSvg" TEXT,
ADD COLUMN     "iconUrl" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ProductCategory_isPublished_idx" ON "ProductCategory"("isPublished");

-- CreateIndex
CREATE INDEX "ProductCategory_sortOrder_idx" ON "ProductCategory"("sortOrder");

-- CreateIndex
CREATE INDEX "ProductSubCategory_isPublished_idx" ON "ProductSubCategory"("isPublished");

-- CreateIndex
CREATE INDEX "ProductSubCategory_sortOrder_idx" ON "ProductSubCategory"("sortOrder");
