import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { Input, Json, Verification, VerificationResult } from './types.js';
import { pointer, render } from './templates.js';

export async function verify(checks: Verification[], input: Input, data: Json, cwd: string): Promise<VerificationResult[]> {
  return Promise.all(checks.map(async check => {
    if (check.type === 'result') {
      const passed = isDeepStrictEqual(pointer(data, check.pointer), check.equals);
      return { check, passed, detail: passed ? 'Result matched expected value' : 'Result did not match expected value' };
    }
    if (check.type === 'result-contains') {
      const value = pointer(data, check.pointer);
      const passed = typeof value === 'string' && value.includes(render(check.contains, input));
      return { check, passed, detail: passed ? 'Captured text contains the expected result' : 'Captured text did not contain the expected result' };
    }
    try {
      const info = await stat(resolve(cwd, render(check.path, input)));
      const passed = info.isFile() && (!check.nonEmpty || info.size > 0);
      return { check, passed, detail: passed ? 'File exists and meets size condition' : 'Path is not a file or is empty' };
    } catch {
      return { check, passed: false, detail: 'File is unavailable' };
    }
  }));
}
