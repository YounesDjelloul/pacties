export type AppErrorCode = 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'INTERNAL';

export abstract class AppError extends Error {
  abstract readonly code: AppErrorCode;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND';
}

export class ValidationError extends AppError {
  readonly code = 'VALIDATION';
}

export class ConflictError extends AppError {
  readonly code = 'CONFLICT';
}

export class InternalError extends AppError {
  readonly code = 'INTERNAL';
}
