-- CreateTable
CREATE TABLE "ProductReviewImage" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "cloudinaryPublicId" TEXT NOT NULL,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductReviewImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductReviewImage_reviewId_idx" ON "ProductReviewImage"("reviewId");

-- CreateIndex
CREATE INDEX "ProductReviewImage_sortOrder_idx" ON "ProductReviewImage"("sortOrder");

-- AddForeignKey
ALTER TABLE "ProductReviewImage" ADD CONSTRAINT "ProductReviewImage_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ProductReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
