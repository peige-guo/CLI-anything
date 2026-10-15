import { Registry } from '../src/registry.js';
import { Runtime } from '../src/runtime.js';
import { defaultAdapters } from '../src/adapters/index.js';
import { validateManifest } from '../src/manifest.js';
import type { Capability } from '../src/types.js';

export const sourceDir = process.cwd();
export async function setup(override: Partial<Capability> = {}, approved = true) {
  const adapters = defaultAdapters();
  const manifest = await validateManifest({ schemaVersion: 1,
    application: { id: 'fixture', name: 'Fixture', version: '1.0', description: 'Test fixture' },
    capabilities: [{ name: 'app.run', description: 'Run test fixture', effect: 'read',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false }, timeoutMs: 3000,
      verification: [{ type: 'result', pointer: '/ready', equals: true }],
      bindings: [{ id: 'one', adapter: 'process', config: { command: process.execPath, args: ['-e', 'process.stdout.write(JSON.stringify({ready:true}))'], output: 'json' } }],
      ...override,
    }],
  }, adapters);
  const registry = new Registry(':memory:');
  registry.register(manifest, sourceDir, approved);
  return { runtime: new Runtime(registry, adapters), registry, manifest };
}
