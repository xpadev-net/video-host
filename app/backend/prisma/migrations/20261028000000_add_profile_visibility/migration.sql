-- AlterTable
ALTER TABLE `User` ADD COLUMN `visibility` ENUM('PUBLIC', 'UNLISTED', 'PRIVATE', 'LIMITED') NOT NULL DEFAULT 'PUBLIC';

-- CreateTable
CREATE TABLE `ProfileViewer` (
    `profileId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`profileId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `User_visibility_idx` ON `User`(`visibility`);

-- CreateIndex
CREATE INDEX `ProfileViewer_userId_idx` ON `ProfileViewer`(`userId`);

-- AddForeignKey
ALTER TABLE `ProfileViewer` ADD CONSTRAINT `ProfileViewer_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProfileViewer` ADD CONSTRAINT `ProfileViewer_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
