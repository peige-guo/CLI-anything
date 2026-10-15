import { expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer, toolName } from '../src/mcp.js';
import { setup } from './helpers.js';

test('real MCP client discovers and invokes an approved capability', async () => {
  const { runtime, registry } = await setup();
  const server = createMcpServer(runtime);
  const client = new Client({ name: 'integration-test', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    expect(tools.tools).toHaveLength(1);
    const result = await client.callTool({ name: tools.tools[0]!.name, arguments: {} });
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({ status: 'succeeded', verified: true });
  } finally { await client.close(); await server.close(); registry.close(); }
});

test('MCP policy hides write capabilities by default', async () => {
  const { runtime, registry } = await setup({ effect: 'write' });
  const server = createMcpServer(runtime);
  const client = new Client({ name: 'policy-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(b), client.connect(a)]);
    expect((await client.listTools()).tools).toHaveLength(0);
    expect(await client.callTool({ name: toolName('fixture', 'app.run'), arguments: {} })).toMatchObject({ isError: true });
  } finally { await client.close(); await server.close(); registry.close(); }
});

test('MCP tool names are bounded and preserve distinct semantic identities', () => {
  expect(toolName('app', 'a.b')).not.toBe(toolName('app', 'a_b'));
  expect(toolName('a'.repeat(48), 'b'.repeat(100)).length).toBeLessThanOrEqual(64);
});
