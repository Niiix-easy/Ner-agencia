export interface ListQueryOptions {
  search?: string;
  searchFields?: string[];
  status?: string;
  includeArchived?: boolean;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  paginated?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function parseListQuery(query: Record<string, unknown>, searchFields: string[]): ListQueryOptions {
  const search = typeof query.search === 'string' ? query.search.trim() : undefined;
  const status = typeof query.status === 'string' && query.status.trim() && query.status !== 'all' ? query.status.trim() : undefined;
  const includeArchived = String(query.includeArchived || 'false').toLowerCase() === 'true';
  const sortBy = typeof query.sortBy === 'string' && query.sortBy.trim() ? query.sortBy.trim() : undefined;
  const sortDir: 'asc' | 'desc' = String(query.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const page = query.page !== undefined ? Math.max(1, Number(query.page) || 1) : undefined;
  const limit = query.limit !== undefined ? Math.min(200, Math.max(1, Number(query.limit) || 25)) : undefined;
  const paginated = String(query.paginated || 'false').toLowerCase() === 'true' || page !== undefined || limit !== undefined;

  return {
    search,
    searchFields,
    status,
    includeArchived,
    sortBy,
    sortDir,
    page: page ?? 1,
    limit: limit ?? 25,
    paginated,
  };
}

export function applyListQuery<T extends Record<string, any>>(
  items: T[],
  options: ListQueryOptions
): T[] | PaginatedResult<T> {
  let result = items.slice();

  // Exclude soft-deleted/archived records unless explicitly requested
  if (!options.includeArchived) {
    result = result.filter((item) => !item.archivedAt);
  }

  if (options.status) {
    const targetStatus = options.status.toLowerCase();
    result = result.filter((item) => String(item.status || '').toLowerCase() === targetStatus);
  }

  if (options.search && options.searchFields && options.searchFields.length > 0) {
    const needle = options.search.toLowerCase();
    result = result.filter((item) =>
      options.searchFields!.some((field) => String(item[field] ?? '').toLowerCase().includes(needle))
    );
  }

  if (options.sortBy) {
    const field = options.sortBy;
    const dir = options.sortDir === 'asc' ? 1 : -1;
    result.sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (av === bv) return 0;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }

  if (!options.paginated) {
    return result;
  }

  const page = Math.max(1, options.page || 1);
  const limit = Math.min(200, Math.max(1, options.limit || 25));
  const total = result.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const data = result.slice(start, start + limit);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
    },
  };
}
