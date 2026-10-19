import { CreateRepository, FindPageRepository, UpdateRepository } from "@poupig/shared";
import { Budget, BudgetCategory, BudgetState } from "../model";

export interface CreateBudgetData extends BudgetState {
  // TODO: adjust to the fields a caller provides when creating a Budget.
}

export interface UpdateBudgetData extends Partial<BudgetState> {
  id: string;
  // TODO: adjust to the fields a caller may change when updating a Budget.
}

export interface BudgetFilter {
  // TODO: declare the fields used to filter a Budget page.
}

export interface BudgetRepository
  extends CreateRepository<CreateBudgetData, Budget>,
    UpdateRepository<UpdateBudgetData, Budget>,
    FindPageRepository<Budget, BudgetFilter> {
  findByCategory(category: BudgetCategory): Promise<Budget[]>;
}
