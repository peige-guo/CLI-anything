import { Ajv } from 'ajv';
import type { Schema } from './types.js';
import { AppError, assert } from './errors.js';

export function validator(schema: Schema, defaults = false) {
  try {
    const ajv = new Ajv({ strict: true, allErrors: true, useDefaults: defaults, ownProperties: true });
    return ajv.compile(schema);
  } catch {
    throw new AppError('INVALID_SCHEMA', 'Invalid or unsupported JSON Schema (draft-07, strict mode).', 2);
  }
}

export function validateValue(schema: Schema, value: unknown, code = 'INVALID_INPUT', defaults = false): unknown {
  const validate = validator(schema, defaults);
  const copy: unknown = structuredClone(value);
  if (!validate(copy)) {
    const details = validate.errors?.map(e => `${e.instancePath || '/'} ${e.message}`).join('; ');
    throw new AppError(code, details ?? 'Schema validation failed', 2);
  }
  return copy;
}

export function parseJson(text: string): unknown {
  try { return JSON.parse(text); }
  catch { throw new AppError('INVALID_JSON', 'Expected valid JSON.', 2); }
}

export function object(value: unknown, location = 'value'): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_CONFIG', `${location} must be an object`);
  return value as Record<string, unknown>;
}

export function string(value: unknown, location: string): string {
  assert(typeof value === 'string' && value.length > 0, 'INVALID_CONFIG', `${location} must be a nonempty string`);
  return value;
}
