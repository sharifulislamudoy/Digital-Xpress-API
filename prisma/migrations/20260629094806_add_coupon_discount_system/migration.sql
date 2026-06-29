-- CreateEnum
CREATE TYPE "CouponScope" AS ENUM ('ALL_PRODUCTS', 'CATEGORY', 'PRODUCT');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "couponDiscountPercentage" DECIMAL(5,2),
ADD COLUMN     "couponDiscountScope" "CouponScope",
ADD COLUMN     "couponId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "discountedUnitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lineDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "originalUnitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "unitDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "scope" "CouponScope" NOT NULL DEFAULT 'ALL_PRODUCTS',
    "discountPercentage" DECIMAL(5,2) NOT NULL,
    "maxDiscountAmount" DECIMAL(12,2),
    "minOrderAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "categoryId" TEXT,
    "productId" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "couponCode" TEXT NOT NULL,
    "discountPercentage" DECIMAL(5,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_code_idx" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_scope_idx" ON "Coupon"("scope");

-- CreateIndex
CREATE INDEX "Coupon_categoryId_idx" ON "Coupon"("categoryId");

-- CreateIndex
CREATE INDEX "Coupon_productId_idx" ON "Coupon"("productId");

-- CreateIndex
CREATE INDEX "Coupon_isActive_idx" ON "Coupon"("isActive");

-- CreateIndex
CREATE INDEX "Coupon_startsAt_idx" ON "Coupon"("startsAt");

-- CreateIndex
CREATE INDEX "Coupon_endsAt_idx" ON "Coupon"("endsAt");

-- CreateIndex
CREATE INDEX "Coupon_createdAt_idx" ON "Coupon"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_orderId_key" ON "CouponRedemption"("orderId");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponCode_idx" ON "CouponRedemption"("couponCode");

-- CreateIndex
CREATE INDEX "CouponRedemption_createdAt_idx" ON "CouponRedemption"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_couponId_userId_key" ON "CouponRedemption"("couponId", "userId");

-- CreateIndex
CREATE INDEX "Order_couponId_idx" ON "Order"("couponId");

-- CreateIndex
CREATE INDEX "Order_couponCode_idx" ON "Order"("couponCode");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
