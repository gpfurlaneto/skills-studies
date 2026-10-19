export type SortDirection = "asc" | "desc";

export interface PageSort<TSortField extends string = string> {
  field: TSortField;
  direction: SortDirection;
}

export interface PageRequest<TFilter = unknown, TSortField extends string = string> {
  page: number;
  pageSize: number;
  filter?: TFilter;
  sort?: PageSort<TSortField>[];
}

export interface PageResult<TEntity> {
  items: TEntity[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};
