import { describe, expect, test } from 'vitest';
import { setup } from './helpers.js';
import type { Execution } from '../src/types.js';

describe('capability runtime', () => {
  test('executes and retains a verified process outcome', async () => {
    const { runtime, registry } = await setup();
    try {
      const execution = await runtime.execute('fixture', 'app.run', {}) as Execution;
      expect(execution.status).toBe('succeeded');
      expect(execution.verified).toBe(true);
      expect(registry.execution(execution.id)).toEqual(execution);
      expect(registry.metrics('fixture', 'app.run', registry.get('fixture').digest)[0]).toMatchObject({ attempts: 1, verified: 1 });
    } finally { registry.close(); }
  });

  test('candidate capabilities can be planned but cannot execute', async () => {
    const { runtime, registry } = await setup({}, false);
    try {
      await expect(runtime.execute('fixture', 'app.run', {})).rejects.toMatchObject({ code: 'UNAPPROVED_APP' });
      expect(await runtime.execute('fixture', 'app.run', {}, { dryRun: true })).toMatchObject({ dryRun: true, approved: false });
    } finally { registry.close(); }
  });

  test.each(['write', 'destructive'] as const)('%s requires separate authority', async effect => {
    const { runtime, registry } = await setup({ effect });
    try {
      await expect(runtime.execute('fixture', 'app.run', {})).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
      if (effect === 'destructive') await expect(runtime.execute('fixture', 'app.run', {}, { allowWrite: true })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
      expect(await runtime.execute('fixture', 'app.run', {}, effect === 'write' ? { allowWrite: true } : { allowDestructive: true })).toMatchObject({ status: 'succeeded' });
    } finally { registry.close(); }
  });

  test('rejects unknown input keys before launching a process', async () => {
    const { runtime, registry } = await setup();
    try { await expect(runtime.execute('fixture', 'app.run', { extra: true })).rejects.toMatchObject({ code: 'INVALID_INPUT' }); }
    finally { registry.close(); }
  });

  test('verifies postconditions even when the adapter exits successfully', async () => {
    const { runtime, registry } = await setup({ verification: [{ type: 'result', pointer: '/ready', equals: false }] });
    try {
      expect(await runtime.execute('fixture', 'app.run', {})).toMatchObject({ status: 'failed', verified: false, error: { code: 'VERIFICATION_FAILED' } });
    } finally { registry.close(); }
  });

  test('an output-schema mismatch fails the execution', async () => {
    const { runtime, registry } = await setup({ outputSchema: { type: 'string' } });
    try { expect(await runtime.execute('fixture', 'app.run', {})).toMatchObject({ status: 'failed', error: { code: 'INVALID_OUTPUT' } }); }
    finally { registry.close(); }
  });

  test('process timeouts terminate the operation and record uncertainty', async () => {
    const { runtime, registry } = await setup({ timeoutMs: 100, bindings: [{ id: 'slow', adapter: 'process', priority: 0,
      config: { command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], output: 'text' } }] });
    try {
      expect(await runtime.execute('fixture', 'app.run', {})).toMatchObject({ status: 'failed', error: { code: 'TIMEOUT' } });
    } finally { registry.close(); }
  });

  test('caps streamed output', async () => {
    const { runtime, registry } = await setup({ bindings: [{ id: 'large', adapter: 'process', priority: 0,
      config: { command: process.execPath, args: ['-e', 'process.stdout.write("x".repeat(2*1024*1024))'], output: 'text' } }] });
    try { expect(await runtime.execute('fixture', 'app.run', {})).toMatchObject({ status: 'failed', error: { code: 'OUTPUT_LIMIT' } }); }
    finally { registry.close(); }
  });

  test('promotion requires current verified evidence and preserves capability identity', async () => {
    const { runtime, registry, manifest } = await setup();
    try {
      expect(() => registry.promote('fixture', 'app.run', 'one')).toThrow(/Execute and verify/);
      await runtime.execute('fixture', 'app.run', {});
      registry.promote('fixture', 'app.run', 'one');
      expect(registry.get('fixture').manifest.capabilities[0]!.name).toBe('app.run');
      // After any re-registration, historical proof cannot approve changed configuration.
      registry.register(manifest, '/different/source', true);
      expect(() => registry.promote('fixture', 'app.run', 'one')).toThrow(/Execute and verify/);
    } finally { registry.close(); }
  });

  test('failed writes execute exactly one binding without fallback', async () => {
    const bindings = [
      { id: 'fails', adapter: 'process', priority: 10, config: { command: process.execPath, args: ['-e', 'process.exit(1)'], output: 'json' } },
      { id: 'would-succeed', adapter: 'process', priority: 0, config: { command: process.execPath, args: ['-e', 'console.log(JSON.stringify({ready:true}))'], output: 'json' } },
    ];
    const { runtime, registry } = await setup({ effect: 'write', bindings });
    try {
      expect(await runtime.execute('fixture', 'app.run', {}, { allowWrite: true })).toMatchObject({ binding: 'fails', status: 'failed' });
      expect(registry.metrics('fixture', 'app.run', registry.get('fixture').digest)).toHaveLength(1);
    } finally { registry.close(); }
  });
});
