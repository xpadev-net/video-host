import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 200;

export const PageNumberSchema = z.coerce.number().int().min(1).default(1);

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
