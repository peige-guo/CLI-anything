import { ReaClient } from '../rea.js';
import { assert } from '../errors.js';
import { object, string } from '../validation.js';
import { parameter, render } from '../templates.js';
import type { Adapter, AdapterContext, AdapterResult, Capability, Input, Json } from '../types.js';

// A bounded list of static producer tools; runtime/UI tools require write authority.
const READ_TOOLS = new Set(['analyze_javascript_application', 'inspect_artifact', 'inspect_binary_layout', 'inspect_macho', 'inspect_managed_assembly']);

export function bindArguments(value: unknown, input: Input): unknown {
  if (typeof value === 'string') {
    const exact = /^\{\{([a-zA-Z_][\w-]*)\}\}$/.exec(value);
    return exact ? parameter(input, exact[1]!) : render(value, input);
  }
  if (Array.isArray(value)) return value.map(item => bindArguments(item, input));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, bindArguments(item, input)]));
  return value;
}

export class ReaAdapter implements Adapter {
  readonly kind = 'rea';

  validate(config: Record<string, unknown>, capability: Capability) {
    assert(Object.keys(config).every(key => ['tool', 'arguments'].includes(key)), 'INVALID_CONFIG', 'Unknown REA config field');
    const tool = string(config.tool, 'tool');
    assert(/^[a-z][a-z0-9_]*$/.test(tool), 'INVALID_CONFIG', 'REA tool must be a fixed identifier');
    object(config.arguments, 'arguments');
    assert(capability.effect !== 'read' || READ_TOOLS.has(tool), 'INVALID_CONFIG', 'This REA tool requires at least write authority');
  }

  async execute(config: Record<string, unknown>, input: Input, context: AdapterContext): Promise<AdapterResult> {
    const client = new ReaClient();
    try {
      context.signal.throwIfAborted();
      await client.connect();
      context.signal.throwIfAborted();
      const evidence = await client.call(config.tool as string, bindArguments(config.arguments, input) as Record<string, unknown>, context.signal);
      assert(Buffer.byteLength(JSON.stringify(evidence)) <= context.maxOutputBytes, 'OUTPUT_LIMIT', 'REA Evidence exceeds the execution record limit; narrow the requested analysis');
      return { data: evidence.normalized_result, evidence: evidence as unknown as Json };
    } finally { await client.close(); }
  }
}
