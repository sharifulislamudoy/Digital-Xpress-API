-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'moderator', 'customer');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'customer';
