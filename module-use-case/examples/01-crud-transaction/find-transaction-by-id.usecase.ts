import { NotFoundError, UseCase } from "@poupig/shared";
import { TransactionType } from "../model";
import { TransactionRepository } from "../provider";

export interface FindTransactionByIdIn {
  id: string;
}

export interface FindTransactionByIdOut {
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

export class FindTransactionById implements UseCase<
  FindTransactionByIdIn,
  FindTransactionByIdOut
> {
  constructor(private readonly transactionRepository: TransactionRepository) {}

  async execute(input: FindTransactionByIdIn): Promise<FindTransactionByIdOut> {
    const transaction = await this.transactionRepository.findById(input.id);

    if (!transaction) {
      throw new NotFoundError("transaction.not.found");
    }

    return {
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
    };
  }
}
