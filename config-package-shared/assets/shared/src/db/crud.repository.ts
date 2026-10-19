import { CreateRepository } from "./create.repository";
import { DeleteRepository } from "./delete.repository";
import { FindByIdRepository } from "./find-by-id.repository";
import { FindPageRepository } from "./find-page.repository";
import { UpdateRepository } from "./update.repository";

export interface CrudRepository<
  TEntity,
  TCreateData,
  TUpdateData extends { id: TId },
  TFilter = unknown,
  TSortField extends string = string,
  TId = string,
>
  extends CreateRepository<TCreateData, TEntity>,
    UpdateRepository<TUpdateData, TEntity>,
    DeleteRepository<TId>,
    FindByIdRepository<TEntity, TId>,
    FindPageRepository<TEntity, TFilter, TSortField> {}
