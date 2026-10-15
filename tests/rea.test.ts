import { expect, test } from 'vitest';
import { discoverRea } from '../src/discovery/rea.js';
import { ReaClient } from '../src/rea.js';

test('real installed REA analyzes an Electron artifact without launching it', async () => {
  const report = await discoverRea('tests/fixtures/electron-app');
  expect(report.evidence.operation).toBe('analyze_javascript_application');
  expect(report.candidates.some(candidate => candidate.kind === 'ipc-channel')).toBe(true);
  expect(report.candidates.every(candidate => candidate.status === 'candidate' && !candidate.executable)).toBe(true);
  expect(report.candidates.some(candidate => candidate.labels.includes('document.export'))).toBe(true);
}, 60000);

test('REA MCP contract exposes the discovery and replay providers we integrate', async () => {
  const client = new ReaClient();
  try {
    await client.connect();
    const tools = await client.tools();
    for (const name of ['analyze_javascript_application', 'capture_browser_scenario']) {
      expect(tools.some(tool => tool.name === name)).toBe(true);
    }
  } finally { await client.close(); }
}, 30000);

test('actual upstream failures retain their diagnostic code in the CLI boundary', async () => {
  const client = new ReaClient();
  try {
    await client.connect();
    await expect(client.call('analyze_javascript_application', {
      input_path: '/cli-anything-nonexistent-analysis-target', format: 'auto', integrity_policy: 'fail',
    })).rejects.toThrow(/REA analyze_javascript_application \[[^\]]+\]:/);
  } finally { await client.close(); }
}, 30000);
