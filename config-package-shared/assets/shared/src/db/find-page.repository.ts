import { PageRequest, PageResult } from "./page-data";

export interface FindPageRepository<
  TEntity,
  TFilter = unknown,
  TSortField extends string = string,
> {
  findPage(request: PageRequest<TFilter, TSortField>): Promise<PageResult<TEntity>>;
}
