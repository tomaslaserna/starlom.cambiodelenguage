export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export type PaginationInput = {
  page?: string | null;
  pageSize?: string | null;
};

export function parsePagination(input: PaginationInput) {
  const page = Math.max(1, Number.parseInt(input.page ?? "1", 10) || 1);
  const requestedSize = Number.parseInt(input.pageSize ?? String(DEFAULT_PAGE_SIZE), 10);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedSize || DEFAULT_PAGE_SIZE));

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}
