/*
  Warnings:

  - A unique constraint covering the columns `[accessKey]` on the table `AwsAccount` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "AwsAccount_userId_key";

-- CreateIndex
CREATE UNIQUE INDEX "AwsAccount_accessKey_key" ON "AwsAccount"("accessKey");
