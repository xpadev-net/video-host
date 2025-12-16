-- AlterTable
ALTER TABLE `Movie` MODIFY `title` VARCHAR(512) NOT NULL,
    MODIFY `description` TEXT NULL;

-- AlterTable
ALTER TABLE `Playlist` MODIFY `title` VARCHAR(512) NOT NULL,
    MODIFY `description` TEXT NULL;

-- AlterTable
ALTER TABLE `Series` MODIFY `title` VARCHAR(512) NOT NULL,
    MODIFY `description` TEXT NULL;
