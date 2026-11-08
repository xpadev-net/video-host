-- Schema-only change for fresh database initialization.
-- Existing account/profile data is not backfilled by this migration.

-- DropForeignKey
ALTER TABLE `User` DROP FOREIGN KEY `User_authUserId_fkey`;

-- DropForeignKey
ALTER TABLE `AuthProfile` DROP FOREIGN KEY `AuthProfile_authUserId_fkey`;

-- DropForeignKey
ALTER TABLE `AuthProfile` DROP FOREIGN KEY `AuthProfile_profileId_fkey`;

-- DropIndex
DROP INDEX `User_authUserId_key` ON `User`;

-- DropIndex
DROP INDEX `User_kind_createdAt_idx` ON `User`;

-- AlterTable
ALTER TABLE `User` DROP COLUMN `authUserId`,
    DROP COLUMN `kind`,
    DROP COLUMN `role`,
    ADD COLUMN `accountId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `AuthUser` ADD COLUMN `role` ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    MODIFY `email` VARCHAR(320) NULL;

-- DropTable
DROP TABLE `AuthProfile`;

-- CreateIndex
CREATE INDEX `User_accountId_createdAt_idx` ON `User`(`accountId`, `createdAt`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `AuthUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Match the application-managed update timestamp in the current schema.
-- AlterTable
ALTER TABLE `AccessInvitation` ALTER COLUMN `updatedAt` DROP DEFAULT;

