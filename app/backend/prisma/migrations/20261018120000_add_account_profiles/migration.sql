CREATE TABLE `AuthProfile` (
  `id` VARCHAR(191) NOT NULL,
  `authUserId` VARCHAR(191) NOT NULL,
  `profileId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `AuthProfile_profileId_key` (`profileId`),
  UNIQUE INDEX `AuthProfile_authUserId_profileId_key` (`authUserId`, `profileId`),
  INDEX `AuthProfile_authUserId_idx` (`authUserId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AuthProfile` ADD CONSTRAINT `AuthProfile_authUserId_fkey`
  FOREIGN KEY (`authUserId`) REFERENCES `AuthUser` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AuthProfile` ADD CONSTRAINT `AuthProfile_profileId_fkey`
  FOREIGN KEY (`profileId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
