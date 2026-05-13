import { NextFunction, Request, Response } from 'express';

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err instanceof AppError ? err.statusCode : 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
}
