import { Buffer } from "node:buffer";
import { z } from "zod";

export const MAX_NAME_LENGTH = 191;
export const MAX_TITLE_LENGTH = 512;
export const MAX_TEXT_COLUMN_BYTES = 65_535;
export const MAX_VIEWER_IDS = 100;
export const MAX_ADDITIONAL_PROFILES = 10;

export const NameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);
export const UsernameSchema = z.string().regex(/^[a-zA-Z0-9_-]{3,32}$/);
export const TitleSchema = z.string().trim().min(1).max(MAX_TITLE_LENGTH);

export const DescriptionSchema = z
  .string()
  .max(MAX_TEXT_COLUMN_BYTES)
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= MAX_TEXT_COLUMN_BYTES,
    `Must fit in a MySQL TEXT column (${MAX_TEXT_COLUMN_BYTES} UTF-8 bytes maximum)`,
  );

export const HttpUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => /^https?:\/\//i.test(value), "Expected an http(s) URL");

export const AvatarUrlSchema = HttpUrlSchema;
