import { expect, test } from 'vitest';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { startServer } from '../examples/web-notes/server.mjs';
import { loadManifest, validateManifest } from '../src/manifest.js';
import { Registry } from '../src/registry.js';
import { Runtime } from '../src/runtime.js';
import { defaultAdapters } from '../src/adapters/index.js';
import type { Execution } from '../src/types.js';

test('GUI-only application is controlled with semantic targets and verified', async () => {
  const server = await startServer(0);
  const adapters = defaultAdapters();
  const manifest = await loadManifest('examples/web-notes/manifest.json', adapters);
  manifest.capabilities[0]!.bindings[0]!.config.url = `http://127.0.0.1:${server.address().port}`;
  const registry = new Registry(':memory:');
  registry.register(manifest, process.cwd(), true);
  const runtime = new Runtime(registry, adapters);
  try {
    const result = await runtime.execute('web-notes', 'note.create', { title: 'Hello Agent' }, { allowWrite: true });
    expect(result).toMatchObject({ status: 'succeeded', verified: true, data: { status: 'Created: Hello Agent' } });
    // A changed application condition fails; it is not accepted as a successful macro.
    const config = manifest.capabilities[0]!.bindings[0]!.config;
    (config.postconditions as { text: string }[])[0]!.text = 'wrong result';
    manifest.capabilities[0]!.timeoutMs = 500;
    registry.register(manifest, process.cwd(), true);
    const failure = await runtime.execute('web-notes', 'note.create', { title: 'Broken condition' }, { allowWrite: true }) as Execution;
    expect(failure.verified).toBe(false);
  } finally { registry.close(); await new Promise(resolve => server.close(resolve)); }
});

test('REA itself replays the GUI workflow and preserves canonical Evidence', async () => {
  const server = await startServer(0);
  const raw = JSON.parse(await readFile('examples/rea-browser/manifest.template.json', 'utf8'));
  const args = raw.capabilities[0].bindings[0].config.arguments;
  args.start_url.url = `http://127.0.0.1:${server.address().port}`;
  args.browser.executable_path = chromium.executablePath();
  const adapters = defaultAdapters();
  const manifest = await validateManifest(raw, adapters);
  const registry = new Registry(':memory:');
  registry.register(manifest, process.cwd(), true);
  const runtime = new Runtime(registry, adapters);
  try {
    const result = await runtime.execute('rea-notes', 'note.create', { title: 'REA powered workflow' }, { allowWrite: true }) as Execution;
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({ status: 'succeeded', verified: true, evidence: { operation: 'capture_browser_scenario' } });
  } finally { registry.close(); await new Promise(resolve => server.close(resolve)); }
}, 60000);
