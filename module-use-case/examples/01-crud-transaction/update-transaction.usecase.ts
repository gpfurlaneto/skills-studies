import { NotFoundError, UseCase } from "@poupig/shared";
import { TransactionType } from "../model";
import { TransactionRepository } from "../provider";

export interface UpdateTransactionIn {
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
}

export interface UpdateTransactionOut {
  id: string;
}

export class UpdateTransaction implements UseCase<
  UpdateTransactionIn,
  UpdateTransactionOut
> {
  constructor(private readonly transactionRepository: TransactionRepository) {}

  async execute(input: UpdateTransactionIn): Promise<UpdateTransactionOut> {
    const { id, ...data } = input;
    const current = await this.transactionRepository.findById(id);

    if (!current) {
      throw new NotFoundError("transaction.not.found");
    }

    const transaction = current.clone(data);

    transaction.validate();

    const updated = await this.transactionRepository.update(transaction);

    return {
      id: updated.id,
    };
  }
}
