-- Clean break: legacy bearer sessions and password hashes are intentionally
-- invalidated. Existing domain IDs, roles, content ownership and external IDs
-- are retained. Human accounts are never auto-claimed by mutable profile data.
ALTER TABLE `User`
  ADD COLUMN `kind` ENUM('HUMAN', 'SYSTEM') NOT NULL DEFAULT 'HUMAN',
  ADD COLUMN `authUserId` VARCHAR(191) NULL;

-- Preserve the previous machine-account definition before removing passwords.
UPDATE `User` SET `kind` = 'SYSTEM'
WHERE `password` IS NULL AND `externalId` IS NULL;

DROP TABLE `Session`;
ALTER TABLE `User` DROP COLUMN `password`;

CREATE TABLE `AuthUser` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(320) NOT NULL,
  `emailVerified` BOOLEAN NOT NULL DEFAULT false,
  `image` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `AuthUser_email_key` (`email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AuthSession` (
  `id` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `token` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `ipAddress` VARCHAR(191) NULL,
  `userAgent` TEXT NULL,
  `userId` VARCHAR(191) NOT NULL,
  UNIQUE INDEX `AuthSession_token_key` (`token`),
  INDEX `AuthSession_userId_idx` (`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AuthAccount` (
  `id` VARCHAR(191) NOT NULL,
  `accountId` VARCHAR(512) NOT NULL,
  `providerId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `accessToken` TEXT NULL,
  `refreshToken` TEXT NULL,
  `idToken` TEXT NULL,
  `accessTokenExpiresAt` DATETIME(3) NULL,
  `refreshTokenExpiresAt` DATETIME(3) NULL,
  `scope` TEXT NULL,
  `password` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `AuthAccount_providerId_accountId_key` (`providerId`, `accountId`),
  INDEX `AuthAccount_userId_idx` (`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AuthVerification` (
  `id` VARCHAR(191) NOT NULL,
  `identifier` VARCHAR(191) NOT NULL,
  `value` TEXT NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `AuthVerification_identifier_idx` (`identifier`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AuthRateLimit` (
  `id` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `count` INTEGER NOT NULL,
  `lastRequest` BIGINT NOT NULL,
  UNIQUE INDEX `AuthRateLimit_key_key` (`key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `User_authUserId_key` ON `User` (`authUserId`);
ALTER TABLE `User` ADD CONSTRAINT `User_authUserId_fkey`
  FOREIGN KEY (`authUserId`) REFERENCES `AuthUser` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `AuthSession` ADD CONSTRAINT `AuthSession_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `AuthUser` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AuthAccount` ADD CONSTRAINT `AuthAccount_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `AuthUser` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
