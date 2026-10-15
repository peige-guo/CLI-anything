import { createHash } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Runtime } from './runtime.js';
import type { ExecutionOptions } from './types.js';
import { errorInfo } from './errors.js';

export function toolName(app: string, capability: string) {
  const suffix = createHash('sha256').update(JSON.stringify([app, capability])).digest('hex').slice(0, 10);
  return `${app.slice(0, 16)}__${capability.replace(/\./g, '_').slice(0, 30)}__${suffix}`;
}

export function createMcpServer(runtime: Runtime, policy: ExecutionOptions = {}) {
  const server = new Server({ name: 'cli-anything', version: '0.1.0' }, { capabilities: { tools: {} } });
  const inventory = () => runtime.registry.list().flatMap(row => {
    const app = runtime.registry.get(String(row.id));
    if (!app.approved) return [];
    return app.manifest.capabilities
      .filter(c => c.effect === 'read' || c.effect === 'write' && policy.allowWrite || c.effect === 'destructive' && policy.allowDestructive)
      .map(capability => ({ app: app.manifest.application.id, capability, name: toolName(app.manifest.application.id, capability.name) }));
  });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: inventory().map(({ app, capability, name }) => ({
      name, description: `[${app}] ${capability.description}`,
      inputSchema: capability.inputSchema,
      annotations: { readOnlyHint: capability.effect === 'read', destructiveHint: capability.effect === 'destructive', openWorldHint: true },
    } as Tool)),
  }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    try {
      const entry = inventory().find(item => item.name === request.params.name);
      if (!entry) return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: 'TOOL_NOT_FOUND', message: 'Tool unavailable under current server policy' } }) }] };
      const execution = await runtime.execute(entry.app, entry.capability.name, request.params.arguments ?? {}, policy);
      return { isError: 'status' in execution && execution.status !== 'succeeded', content: [{ type: 'text', text: JSON.stringify(execution) }], structuredContent: execution };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: errorInfo(error) }) }] };
    }
  });
  return server;
}

export async function serveMcp(runtime: Runtime, policy: ExecutionOptions) {
  const server = createMcpServer(runtime, policy);
  const stop = async () => { await server.close(); runtime.registry.close(); };
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
  await server.connect(new StdioServerTransport());
  return server;
}
