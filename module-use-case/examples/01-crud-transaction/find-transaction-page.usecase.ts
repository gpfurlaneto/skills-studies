import {
  IntegerRule,
  MinValueRule,
  PageRequest,
  PageResult,
  RequiredRule,
  UseCase,
  Validator,
} from "@poupig/shared";
import { TransactionType } from "../model";
import { TransactionFilter, TransactionRepository } from "../provider";

export interface FindTransactionPageIn extends PageRequest<TransactionFilter> {}

export interface FindTransactionPageItem {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  occurredAt: Date;
  installments: number;
  accountId: string;
  tags: string[];
  notes?: string;
  paidAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FindTransactionPageOut extends PageResult<FindTransactionPageItem> {}

export class FindTransactionPage implements UseCase<
  FindTransactionPageIn,
  FindTransactionPageOut
> {
  constructor(private readonly transactionRepository: TransactionRepository) {}

  async execute(input: FindTransactionPageIn): Promise<FindTransactionPageOut> {
    Validator.validate([
      {
        code: "page",
        value: input.page,
        rules: [new RequiredRule(), new IntegerRule(), new MinValueRule(1)],
      },
      {
        code: "pageSize",
        value: input.pageSize,
        rules: [new RequiredRule(), new IntegerRule(), new MinValueRule(1)],
      },
    ]);

    const result = await this.transactionRepository.findPage(input);

    return {
      ...result,
      items: result.items.map((transaction) => ({
        id: transaction.id,
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        occurredAt: transaction.occurredAt,
        installments: transaction.installments,
        accountId: transaction.accountId,
        tags: transaction.tags,
        notes: transaction.notes,
        paidAt: transaction.paidAt,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
      })),
    };
  }
}
