/*
  Warnings:

  - Added the required column `awsAccountUsername` to the `AwsAccount` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AwsAccount" ADD COLUMN     "awsAccountUsername" TEXT NOT NULL;
