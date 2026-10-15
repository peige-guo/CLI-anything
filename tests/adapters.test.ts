import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, expect, test } from 'vitest';
import { setup } from './helpers.js';
import { bindArguments } from '../src/adapters/rea.js';
import type { Execution } from '../src/types.js';

describe('adapter boundaries', () => {
  test('process parameters remain single arguments, including shell metacharacters', async () => {
    const value = '$(touch SHOULD_NOT_EXIST); "hello"\nworld';
    const { runtime, registry } = await setup({
      inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false },
      verification: [{ type: 'result', pointer: '/value', equals: value }],
      bindings: [{ id: 'echo', adapter: 'process', priority: 0, config: { command: process.execPath,
        args: ['-e', 'console.log(JSON.stringify({value:process.argv[1]}))', '{{value}}'], output: 'json' } }],
    });
    try { expect(await runtime.execute('fixture', 'app.run', { value })).toMatchObject({ verified: true, data: { value } }); }
    finally { registry.close(); }
  });

  test('HTTP adapter encodes path/query parameters and resolves environment credentials', async () => {
    let observed = '';
    let token: string | undefined;
    const server = createServer((req, res) => {
      observed = req.url!; token = req.headers.authorization;
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ready: true }));
    }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as { port: number }).port;
    process.env.CLI_ANYTHING_TEST_TOKEN = 'test-secret';
    const { runtime, registry } = await setup({
      inputSchema: { type: 'object', properties: { id: { type: 'string' }, query: { type: 'string' } }, required: ['id'], additionalProperties: false },
      bindings: [{ id: 'api', adapter: 'http', priority: 0, config: { baseUrl: `http://127.0.0.1:${port}`, path: '/notes/{{id}}', method: 'GET', query: ['query'], headers: { Authorization: 'Bearer ${ENV:CLI_ANYTHING_TEST_TOKEN}' } } }],
    });
    try {
      expect(await runtime.execute('fixture', 'app.run', { id: 'a/b', query: 'hello & goodbye' })).toMatchObject({ status: 'succeeded' });
      expect(observed).toBe('/notes/a%2Fb?query=hello+%26+goodbye');
      expect(token).toBe('Bearer test-secret');
      const plan = await runtime.execute('fixture', 'app.run', { id: 'secret-input' }, { dryRun: true });
      expect(JSON.stringify(plan)).not.toContain('secret-input');
      expect(JSON.stringify(plan)).not.toContain('test-secret');
    } finally { registry.close(); delete process.env.CLI_ANYTHING_TEST_TOKEN; server.close(); }
  });

  test('HTTP redirects are refused', async () => {
    const server = createServer((_req, res) => { res.writeHead(302, { Location: 'http://127.0.0.1:1' }); res.end(); }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { runtime, registry } = await setup({ bindings: [{ id: 'api', adapter: 'http', priority: 0, config: { baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`, path: '/', method: 'GET' } }] });
    try { expect((await runtime.execute('fixture', 'app.run', {}) as Execution).status).toBe('failed'); }
    finally { registry.close(); server.close(); }
  });

  test('REA templates preserve structured values instead of stringifying them', () => {
    expect(bindArguments({ options: '{{options}}', value: 'name: {{name}}' }, { options: { count: 3 }, name: 'demo' })).toEqual({ options: { count: 3 }, value: 'name: demo' });
  });

  test('known mutating HTTP and UI operations cannot be marked read', async () => {
    await expect(setup({ bindings: [{ id: 'http', adapter: 'http', priority: 0, config: { baseUrl: 'https://example.test', path: '/', method: 'POST' } }] })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    await expect(setup({ bindings: [{ id: 'rea', adapter: 'rea', priority: 0, config: { tool: 'capture_browser_scenario', arguments: {} } }] })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  });
});
