import { UseCase } from "@poupig/shared";
import { Transaction, TransactionType } from "../model";
import { TransactionRepository } from "../provider";

export interface CreateTransactionIn {
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

export class CreateTransaction implements UseCase<CreateTransactionIn, void> {
  constructor(private readonly transactionRepository: TransactionRepository) {}

  async execute(input: CreateTransactionIn): Promise<void> {
    const transaction = new Transaction({ ...input });

    transaction.validate();

    await this.transactionRepository.create(transaction);
  }
}
