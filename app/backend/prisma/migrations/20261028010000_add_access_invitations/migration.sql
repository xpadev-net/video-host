-- CreateTable
CREATE TABLE `AccessInvitation` (
    `id` VARCHAR(191) NOT NULL,
    `inviterId` VARCHAR(191) NOT NULL,
    `inviteeAuthUserId` VARCHAR(191) NOT NULL,
    `targetType` ENUM('MOVIE', 'PROFILE') NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'DECLINED') NOT NULL DEFAULT 'PENDING',
    `grantedProfileId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `AccessInvitation_inviteeAuthUserId_status_idx` ON `AccessInvitation`(`inviteeAuthUserId`, `status`);

-- CreateIndex
CREATE INDEX `AccessInvitation_inviterId_idx` ON `AccessInvitation`(`inviterId`);

-- CreateIndex
CREATE INDEX `AccessInvitation_targetType_targetId_idx` ON `AccessInvitation`(`targetType`, `targetId`);

-- AddForeignKey
ALTER TABLE `AccessInvitation` ADD CONSTRAINT `AccessInvitation_inviterId_fkey` FOREIGN KEY (`inviterId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccessInvitation` ADD CONSTRAINT `AccessInvitation_inviteeAuthUserId_fkey` FOREIGN KEY (`inviteeAuthUserId`) REFERENCES `AuthUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
