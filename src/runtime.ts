import { randomUUID } from 'node:crypto';
import type { Adapter, Capability, Execution, ExecutionOptions, Input, RegisteredApp } from './types.js';
import { Registry } from './registry.js';
import { AppError, assert, errorInfo } from './errors.js';
import { validateValue } from './validation.js';
import { verify } from './verification.js';

export class Runtime {
  constructor(public readonly registry: Registry, public readonly adapters: Map<string, Adapter>) {}

  capability(application: string, name: string): { app: RegisteredApp; capability: Capability } {
    const app = this.registry.get(application);
    const capability = app.manifest.capabilities.find(c => c.name === name);
    assert(capability, 'CAPABILITY_NOT_FOUND', `Unknown capability: ${name}`);
    return { app, capability };
  }

  async execute(application: string, name: string, raw: unknown, options: ExecutionOptions = {}) {
    const { app, capability } = this.capability(application, name);
    const input = validateValue(capability.inputSchema, raw, 'INVALID_INPUT', true) as Input;
    const binding = options.binding
      ? capability.bindings.find(b => b.id === options.binding)
      : [...capability.bindings].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0];
    assert(binding, 'BINDING_NOT_FOUND', 'No matching adapter binding');
    const adapter = this.adapters.get(binding.adapter);
    assert(adapter, 'UNKNOWN_ADAPTER', `Unknown adapter: ${binding.adapter}`);
    adapter.validate(binding.config, capability);
    if (options.dryRun) return {
      dryRun: true, application, capability: name, binding: binding.id, adapter: binding.adapter,
      approved: app.approved, effect: capability.effect, verification: capability.verification,
      // Neither credentials nor parameter values are included in plans.
      parameterNames: Object.keys(input),
    };
    assert(app.approved, 'UNAPPROVED_APP', 'Candidate manifest cannot execute. Review it and register with --approve.');
    assert(capability.effect !== 'write' || options.allowWrite, 'PERMISSION_DENIED', 'Write capability requires --allow-write');
    assert(capability.effect !== 'destructive' || options.allowDestructive, 'PERMISSION_DENIED', 'Destructive capability requires --allow-destructive');
    const started = Date.now();
    const execution: Execution = {
      id: randomUUID(), application, capability: name, binding: binding.id, manifestDigest: app.digest,
      startedAt: new Date(started).toISOString(), durationMs: 0, status: 'failed', verified: false, checks: [],
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), capability.timeoutMs);
    let abortListener: (() => void) | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        abortListener = () => reject(new AppError('TIMEOUT', 'Execution timed out; target effects may already have occurred'));
        controller.signal.addEventListener('abort', abortListener, { once: true });
      });
      const result = await Promise.race([
        adapter.execute(binding.config, input, { cwd: app.sourceDir, signal: controller.signal, maxOutputBytes: 1024 * 1024 }), timeout,
      ]);
      if (capability.outputSchema) validateValue(capability.outputSchema, result.data, 'INVALID_OUTPUT');
      execution.data = result.data;
      execution.evidence = result.evidence;
      execution.checks = await verify(capability.verification, input, result.data, app.sourceDir);
      execution.verified = execution.checks.length > 0 && execution.checks.every(check => check.passed);
      if (!execution.verified) throw new AppError('VERIFICATION_FAILED', 'Execution completed but its postconditions did not pass; effects may already have occurred');
      execution.status = 'succeeded';
    } catch (error) {
      execution.error = errorInfo(error);
    } finally {
      clearTimeout(timer);
      if (abortListener) controller.signal.removeEventListener('abort', abortListener);
      execution.durationMs = Date.now() - started;
    }
    this.registry.save(execution);
    return execution;
  }
}
