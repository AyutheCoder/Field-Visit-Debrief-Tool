import type { NextFunction, Request, Response } from 'express';

/** Operational error with an HTTP status code. */
export class AppError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Wrap an async route handler so thrown/rejected errors reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** 404 fallback for unmatched routes. */
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not found' });
}

/** Centralized error handler. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }

  // Multer / unexpected errors
  const message = err instanceof Error ? err.message : 'Internal server error';
  // eslint-disable-next-line no-console
  console.error('[error]', err);
  res.status(500).json({ error: message });
}

// -------------------------------------------------------------------------
// Lightweight validation helpers
// -------------------------------------------------------------------------

type Body = Record<string, unknown>;

export function requireBody(req: Request): Body {
  if (!req.body || typeof req.body !== 'object') {
    throw new AppError(400, 'Request body must be a JSON object');
  }
  return req.body as Body;
}

export function requireString(body: Body, field: string, max = 5000): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(400, `Field "${field}" is required and must be a non - empty string`);
  }
  if (value.length > max) {
    throw new AppError(400, `Field "${field}" exceeds maximum length of ${max} `);
  }
  return value.trim();
}

export function optionalString(body: Body, field: string, max = 5000): string | undefined {
  const value = body[field];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new AppError(400, `Field "${field}" must be a string`);
  }
  if (value.length > max) {
    throw new AppError(400, `Field "${field}" exceeds maximum length of ${max} `);
  }
  return value.trim();
}

export function optionalNumber(body: Body, field: string): number | undefined {
  const value = body[field];
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new AppError(400, `Field "${field}" must be a number`);
  }
  return n;
}

export function optionalEnum<T extends string>(
  body: Body,
  field: string,
  allowed: readonly T[]
): T | undefined {
  const value = body[field];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new AppError(400, `Field "${field}" must be one of: ${allowed.join(', ')} `);
  }
  return value as T;
}

export function optionalArray(body: Body, field: string): unknown[] | undefined {
  const value = body[field];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new AppError(400, `Field "${field}" must be an array`);
  }
  return value;
}
