import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { validateManifest, loadManifest } from '../src/manifest.js';
import { defaultAdapters } from '../src/adapters/index.js';
import { validateValue } from '../src/validation.js';
import { setup } from './helpers.js';

test('all shipped manifests conform to the public contract', async () => {
  for (const path of ['examples/process/manifest.json', 'examples/web-notes/manifest.json', 'examples/rea-browser/manifest.template.json']) {
    expect((await loadManifest(path, defaultAdapters())).capabilities.length).toBeGreaterThan(0);
  }
});

test('duplicate capability and binding identities are rejected', async () => {
  const raw = JSON.parse(await readFile('examples/process/manifest.json', 'utf8'));
  raw.capabilities.push(raw.capabilities[0]);
  await expect(validateManifest(raw, defaultAdapters())).rejects.toMatchObject({ code: 'INVALID_MANIFEST' });
});

test('schemas apply defaults without coercing input types', () => {
  const schema = { type: 'object', properties: { count: { type: 'integer', default: 5 } }, additionalProperties: false };
  expect(validateValue(schema, {}, 'INVALID_INPUT', true)).toEqual({ count: 5 });
  expect(() => validateValue(schema, { count: '5' })).toThrow();
});

test('unknown schema keywords fail during import', async () => {
  await expect(setup({ inputSchema: { type: 'object', accidentalKeyword: true } })).rejects.toMatchObject({ code: 'INVALID_SCHEMA' });
});

test('changing a registration revokes approval by default', async () => {
  const { registry, manifest } = await setup();
  try { registry.register(manifest, '.', false); expect(registry.get('fixture').approved).toBe(false); }
  finally { registry.close(); }
});
