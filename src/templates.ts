import { AppError, assert } from './errors.js';
import type { Input, Json } from './types.js';

export const parameterPattern = /\{\{([a-zA-Z_][\w-]*)\}\}/g;

export function parameter(input: Input, key: string): Json {
  assert(Object.hasOwn(input, key), 'MISSING_PARAMETER', `Missing template parameter: ${key}`);
  return input[key]!;
}

export function scalar(value: Json): string {
  assert(value !== null && typeof value !== 'object', 'INVALID_PARAMETER', 'Expected a scalar template parameter');
  return String(value);
}

export function render(template: string, input: Input, encode = (x: string) => x): string {
  return template.replace(parameterPattern, (_, key: string) => encode(scalar(parameter(input, key))));
}

export function pointer(value: Json, path: string): Json | undefined {
  if (path === '') return value;
  if (!path.startsWith('/')) throw new AppError('INVALID_POINTER', 'JSON Pointer must start with /', 2);
  let current: Json | undefined = value;
  for (const raw of path.slice(1).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) return undefined;
    current = (current as Record<string, Json>)[key];
  }
  return current;
}
