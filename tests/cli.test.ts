import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const runner = resolve('node_modules/tsx/dist/cli.mjs');
const cli = resolve('src/cli.ts');

test('CLI registration, execution, input rejection and historical verification', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cli-anything-public-cli-'));
  const args = [runner, cli, '--registry', join(directory, 'registry.db')];
  const run = (...command: string[]) => JSON.parse(execFileSync(process.execPath, [...args, ...command], { encoding: 'utf8' }));
  try {
    expect(run('register', 'examples/process/manifest.json').data.approved).toBe(false);
    const denied = spawnSync(process.execPath, [...args, 'execute', 'local-demo', 'app.info'], { encoding: 'utf8' });
    expect(denied.status).toBe(2);
    expect(JSON.parse(denied.stdout).error.code).toBe('UNAPPROVED_APP');
    run('register', 'examples/process/manifest.json', '--approve');
    const execution = run('execute', 'local-demo', 'text.echo', '--input', '{"text":"CLI integration"}');
    expect(execution).toMatchObject({ ok: true, data: { verified: true, data: { received: 'CLI integration' } } });
    expect(run('verify', execution.data.id)).toMatchObject({ data: { historical: true, execution: { verified: true } } });
    const invalid = spawnSync(process.execPath, [...args, 'execute', 'local-demo', 'text.echo', '--input', '{"text":42}'], { encoding: 'utf8' });
    expect(invalid.status).toBe(2);
    expect(JSON.parse(invalid.stdout).error.code).toBe('INVALID_INPUT');
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 30000);

test('MCP stdio entrypoint serves a real external client with clean protocol frames', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cli-anything-public-mcp-'));
  const registry = join(directory, 'registry.db');
  execFileSync(process.execPath, [runner, cli, '--registry', registry, 'register', 'examples/process/manifest.json', '--approve']);
  const transport = new StdioClientTransport({ command: process.execPath, args: [runner, cli, '--registry', registry, 'mcp'], stderr: 'pipe' });
  transport.stderr?.on('data', () => {});
  const client = new Client({ name: 'stdio-integration-test', version: '1' });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools;
    const tool = tools.find(item => item.description?.includes('Read local application information'))!;
    expect(tool).toBeDefined();
    const result = await client.callTool({ name: tool.name, arguments: {} });
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({ verified: true, status: 'succeeded' });
  } finally { await client.close(); await rm(directory, { recursive: true, force: true }); }
}, 30000);
