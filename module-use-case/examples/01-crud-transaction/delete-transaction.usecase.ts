import { NotFoundError, UseCase } from "@poupig/shared";
import { TransactionRepository } from "../provider";

export interface DeleteTransactionIn {
  id: string;
}

export class DeleteTransaction implements UseCase<DeleteTransactionIn, void> {
  constructor(private readonly transactionRepository: TransactionRepository) {}

  async execute(input: DeleteTransactionIn): Promise<void> {
    const transaction = await this.transactionRepository.findById(input.id);

    if (!transaction) {
      throw new NotFoundError("transaction.not.found");
    }

    await this.transactionRepository.delete(transaction.id);
  }
}
