import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 200;
// Bound nested collection includes that do not expose their own pagination.
export const MAX_RELATION_MOVIES = 100;
export const MAX_PAGE_NUMBER = Math.floor(2_147_483_647 / MAX_PAGE_SIZE);

export const PageNumberSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_NUMBER)
  .default(1);

export const pageSizeSchema = (
  defaultSize = DEFAULT_PAGE_SIZE,
  maxSize = MAX_PAGE_SIZE,
) => z.coerce.number().int().min(1).max(maxSize).default(defaultSize);

export const paginationQuerySchema = (
  defaultSize = DEFAULT_PAGE_SIZE,
  maxSize = MAX_PAGE_SIZE,
) =>
  z.object({
    page: PageNumberSchema,
    limit: pageSizeSchema(defaultSize, maxSize),
  });
