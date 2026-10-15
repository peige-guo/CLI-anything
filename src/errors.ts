export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly exitCode = 1) {
    super(message);
    this.name = 'AppError';
  }
}

export function assert(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new AppError(code, message, 2);
}

export function errorInfo(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  if (error && typeof error === 'object' && 'code' in error
    && ['ENOENT', 'EEXIST', 'EACCES', 'EPERM'].includes(String(error.code))) {
    return { code: 'FILE_ERROR', message: `Requested filesystem operation failed (${String(error.code)})` };
  }
  // Adapter errors may contain application data; avoid leaking them by default.
  return { code: 'EXECUTION_FAILED', message: 'Adapter failed. Inspect the target application and adapter configuration.' };
}
