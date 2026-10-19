import {
  DateRule,
  Entity,
  EntityState,
  InRule,
  IntegerRule,
  MaxItemsRule,
  MaxLengthRule,
  MinLengthRule,
  PositiveRule,
  PrecisionRule,
  RangeValueRule,
  RequiredRule,
  SlugRule,
  UniqueItemsRule,
  UuidRule,
  Validator,
} from "@poupig/shared";

export const TRANSACTION_TYPES = ["income", "expense"] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export interface TransactionState extends EntityState {
  description: string;
  amount: number;
  type: TransactionType;
  occurredAt: Date;
  installments: number;
  accountId: string;
  tags: string[];
  notes?: string;
  paidAt?: Date | null;
}

export class Transaction extends Entity<TransactionState> {
  constructor(props: TransactionState) {
    super(props);
  }

  get description(): string {
    return this.props.description;
  }

  get amount(): number {
    return this.props.amount;
  }

  get type(): TransactionType {
    return this.props.type;
  }

  get occurredAt(): Date {
    return this.props.occurredAt;
  }

  get installments(): number {
    return this.props.installments;
  }

  get accountId(): string {
    return this.props.accountId;
  }

  get tags(): string[] {
    return this.props.tags;
  }

  get notes(): string | undefined {
    return this.props.notes;
  }

  get paidAt(): Date | null | undefined {
    return this.props.paidAt;
  }

  validate(): void {
    Validator.validate([
      {
        code: "transaction.description",
        value: this.description,
        rules: [new RequiredRule(), new MinLengthRule(3), new MaxLengthRule(120)],
      },
      {
        code: "transaction.amount",
        value: this.amount,
        rules: [new RequiredRule(), new PositiveRule(), new PrecisionRule(2)],
      },
      {
        code: "transaction.type",
        value: this.type,
        rules: [new RequiredRule(), new InRule(TRANSACTION_TYPES)],
      },
      {
        code: "transaction.occurredAt",
        value: this.occurredAt,
        rules: [new RequiredRule(), new DateRule()],
      },
      {
        code: "transaction.installments",
        value: this.installments,
        rules: [new RequiredRule(), new IntegerRule(), new RangeValueRule(1, 48)],
      },
      {
        code: "transaction.accountId",
        value: this.accountId,
        rules: [new RequiredRule(), new UuidRule()],
      },
      {
        code: "transaction.tags",
        value: this.tags,
        rules: [new MaxItemsRule(10), new UniqueItemsRule(), new SlugRule()],
      },
      {
        code: "transaction.notes",
        value: this.notes,
        rules: [new MaxLengthRule(500)],
      },
      {
        code: "transaction.paidAt",
        value: this.paidAt,
        rules: [new DateRule()],
      },
    ]);
  }
}
