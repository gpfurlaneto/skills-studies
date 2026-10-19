import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError, ValidationException } from '{{SHARED_PKG}}';
import type { ErrorDetail, ErrorResponse } from './error-response.type.js';

const INTERNAL_MESSAGE = 'Internal server error';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const body = this.build(exception, request.url);
    if (body.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    response.status(body.statusCode).json(body);
  }

  private build(exception: unknown, path: string): ErrorResponse {
    const base = { path, timestamp: new Date().toISOString() };

    // Must come before DomainError: ValidationException extends it.
    if (exception instanceof ValidationException) {
      return {
        ...base,
        statusCode: exception.statusCode,
        error: exception.name,
        message: exception.message,
        errors: exception.errors.map((e) => ({ message: e.message })),
      };
    }

    if (exception instanceof DomainError) {
      const isServerError = exception.statusCode >= 500;
      return {
        ...base,
        statusCode: exception.statusCode,
        error: exception.name,
        message: isServerError ? INTERNAL_MESSAGE : exception.message,
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse();
      const { message, errors } = this.fromHttpResponse(res, exception.message);
      return {
        ...base,
        statusCode,
        error: exception.name,
        message: statusCode >= 500 ? INTERNAL_MESSAGE : message,
        ...(errors && statusCode < 500 ? { errors } : {}),
      };
    }

    return {
      ...base,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: INTERNAL_MESSAGE,
    };
  }

  private fromHttpResponse(
    res: string | object,
    fallback: string,
  ): { message: string; errors?: ErrorDetail[] } {
    if (typeof res === 'string') return { message: res };
    const { message } = res as { message?: string | string[] };
    if (Array.isArray(message)) {
      // e.g. Nest ValidationPipe returns a list of messages
      return { message: 'Validation failed', errors: message.map((m) => ({ message: m })) };
    }
    return { message: message ?? fallback };
  }
}
