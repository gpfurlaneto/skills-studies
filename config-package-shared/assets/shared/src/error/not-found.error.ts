import { DomainError } from './domain.error';

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 404);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}
