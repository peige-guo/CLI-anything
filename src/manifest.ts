import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateValue, validator, parseJson } from './validation.js';
import { assert } from './errors.js';
import type { Adapter, Manifest, Schema } from './types.js';

const schemaPath = fileURLToPath(new URL('../schemas/manifest.schema.json', import.meta.url));

export async function validateManifest(value: unknown, adapters: Map<string, Adapter>): Promise<Manifest> {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8')) as Schema;
  const manifest = validateValue(schema, value, 'INVALID_MANIFEST', true) as Manifest;
  const names = new Set<string>();
  for (const capability of manifest.capabilities) {
    assert(!names.has(capability.name), 'INVALID_MANIFEST', `Duplicate capability: ${capability.name}`);
    names.add(capability.name);
    assert(capability.inputSchema.type === 'object', 'INVALID_SCHEMA', 'Capability inputSchema must be an object schema');
    validator(capability.inputSchema);
    if (capability.outputSchema) validator(capability.outputSchema);
    const bindings = new Set<string>();
    for (const binding of capability.bindings) {
      assert(!bindings.has(binding.id), 'INVALID_MANIFEST', `Duplicate binding: ${binding.id}`);
      bindings.add(binding.id);
      const adapter = adapters.get(binding.adapter);
      assert(adapter, 'UNKNOWN_ADAPTER', `Unknown adapter: ${binding.adapter}`);
      adapter.validate(binding.config, capability);
    }
  }
  return manifest;
}

export async function loadManifest(path: string, adapters: Map<string, Adapter>) {
  return validateManifest(parseJson(await readFile(path, 'utf8')), adapters);
}
