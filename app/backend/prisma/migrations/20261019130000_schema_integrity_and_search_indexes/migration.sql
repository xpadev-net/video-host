-- DropForeignKey
ALTER TABLE `AuthProfile` DROP FOREIGN KEY `AuthProfile_authUserId_fkey`;

-- DropForeignKey
ALTER TABLE `MovieOnPlaylist` DROP FOREIGN KEY `MovieOnPlaylist_playlistId_fkey`;

-- DropForeignKey
ALTER TABLE `MovieOnPlaylist` DROP FOREIGN KEY `MovieOnPlaylist_movieId_fkey`;

-- DropForeignKey
ALTER TABLE `MovieVariant` DROP FOREIGN KEY `MovieVariant_movieId_fkey`;

-- DropIndex
DROP INDEX `AuthProfile_authUserId_profileId_key` ON `AuthProfile`;

-- AlterTable
ALTER TABLE `User` MODIFY `avatarUrl` TEXT NULL;

-- AlterTable
ALTER TABLE `AuthProfile` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `Movie` MODIFY `thumbnailUrl` TEXT NULL;

-- AlterTable
ALTER TABLE `MovieVariant` MODIFY `contentUrl` TEXT NOT NULL;

-- CreateIndex
CREATE INDEX `User_kind_createdAt_idx` ON `User`(`kind`, `createdAt`);

-- CreateIndex
-- CreateIndex
CREATE INDEX `AuthSession_expiresAt_idx` ON `AuthSession`(`expiresAt`);

-- CreateIndex
CREATE INDEX `AuthVerification_expiresAt_idx` ON `AuthVerification`(`expiresAt`);

-- CreateIndex
CREATE INDEX `Series_visibility_updatedAt_idx` ON `Series`(`visibility`, `updatedAt`);

-- CreateIndex
CREATE INDEX `Series_authorId_updatedAt_idx` ON `Series`(`authorId`, `updatedAt`);

-- CreateIndex
-- CreateIndex
CREATE INDEX `Playlist_visibility_updatedAt_idx` ON `Playlist`(`visibility`, `updatedAt`);

-- CreateIndex
CREATE INDEX `Playlist_authorId_updatedAt_idx` ON `Playlist`(`authorId`, `updatedAt`);

-- CreateIndex
-- CreateIndex
CREATE INDEX `Movie_visibility_createdAt_idx` ON `Movie`(`visibility`, `createdAt`);

-- CreateIndex
CREATE INDEX `Movie_seriesId_order_createdAt_idx` ON `Movie`(`seriesId`, `order`, `createdAt`);

-- CreateIndex
-- CreateIndex
CREATE INDEX `MovieVariant_movieId_status_idx` ON `MovieVariant`(`movieId`, `status`);

-- CreateIndex
CREATE UNIQUE INDEX `MovieVariant_movieId_variantId_key` ON `MovieVariant`(`movieId`, `variantId`);

-- AddForeignKey
ALTER TABLE `AuthProfile` ADD CONSTRAINT `AuthProfile_authUserId_fkey` FOREIGN KEY (`authUserId`) REFERENCES `AuthUser`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovieOnPlaylist` ADD CONSTRAINT `MovieOnPlaylist_playlistId_fkey` FOREIGN KEY (`playlistId`) REFERENCES `Playlist`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovieOnPlaylist` ADD CONSTRAINT `MovieOnPlaylist_movieId_fkey` FOREIGN KEY (`movieId`) REFERENCES `Movie`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MovieVariant` ADD CONSTRAINT `MovieVariant_movieId_fkey` FOREIGN KEY (`movieId`) REFERENCES `Movie`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
