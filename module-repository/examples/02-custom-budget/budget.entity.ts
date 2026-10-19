import { Entity, EntityState, RequiredRule, Validator } from "@poupig/shared";

export type BudgetCategory = "food" | "rent";

export interface BudgetState extends EntityState {
  amount: number;
  kind: "fixed" | "variable";
  category: BudgetCategory;
  notes?: string;
}

export class Budget extends Entity<BudgetState> {
  constructor(props: BudgetState) {
    super(props);
  }

  get amount(): number {
    return this.props.amount;
  }

  get category(): BudgetCategory {
    return this.props.category;
  }

  validate(): void {
    Validator.validate([{ code: "budget.amount", value: this.amount, rules: [new RequiredRule()] }]);
  }
}
