export interface CreateRepository<TCreateData, TEntity> {
  create(data: TCreateData): Promise<TEntity>;
}
