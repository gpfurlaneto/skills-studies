import { CrudRepository } from "@poupig/shared";
import { Transaction } from "../model";

export interface TransactionFilter {
  // TODO: declare the fields used to filter a Transaction page.
}

export interface TransactionRepository extends CrudRepository<
  Transaction,
  Transaction,
  Transaction,
  TransactionFilter
> {}
