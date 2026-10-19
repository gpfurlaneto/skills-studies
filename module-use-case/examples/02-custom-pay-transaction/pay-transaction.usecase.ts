import { NotFoundError, UseCase, ValidationError } from "@poupig/shared";
import { ClockProvider, TransactionRepository } from "../provider";

export interface PayTransactionIn {
  id: string;
}

export interface PayTransactionOut {
  id: string;
  paidAt: Date;
}

export class PayTransaction implements UseCase<
  PayTransactionIn,
  PayTransactionOut
> {
  constructor(
    private readonly transactionRepository: TransactionRepository,
    private readonly clockProvider: ClockProvider,
  ) {}

  async execute(input: PayTransactionIn): Promise<PayTransactionOut> {
    const current = await this.transactionRepository.findById(input.id);

    if (!current) {
      throw new NotFoundError("transaction.not.found");
    }

    if (current.paidAt) {
      throw new ValidationError("transaction.already.paid");
    }

    const paidAt = this.clockProvider.now();
    const transaction = current.clone({ paidAt });

    transaction.validate();

    await this.transactionRepository.update(transaction);

    return { id: transaction.id, paidAt };
  }
}
