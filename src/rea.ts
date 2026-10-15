import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { AppError, assert } from './errors.js';
import { object } from './validation.js';
import type { Json } from './types.js';

export const REA_VERSION = '6.5.0';
export const REA_UPSTREAM = 'https://github.com/morluto/rea';
export const REA_SOURCE_COMMIT = '95957d748d8c258933c795f92de7ef99eb6bd2dc';

export interface ReaEvidence {
  evidence_id: string;
  operation: string;
  normalized_result: Json;
  [key: string]: unknown;
}

/** Uses REA's public MCP contract; does not import its private implementation. */
export class ReaClient {
  private readonly client = new Client({ name: 'cli-anything', version: '0.1.0' });
  private transport?: StdioClientTransport;

  async connect() {
    const require = createRequire(import.meta.url);
    const entry = join(dirname(require.resolve('rea-agents/package.json')), 'scripts', 'rea.mjs');
    this.transport = new StdioClientTransport({ command: process.execPath, args: [entry, 'mcp'], stderr: 'pipe' });
    // Drain diagnostics without mixing them into CLI JSON or MCP frames.
    this.transport.stderr?.on('data', () => {});
    try { await this.client.connect(this.transport); }
    catch {
      await this.close();
      throw new AppError('REA_UNAVAILABLE', 'Could not start REA. Check the supported Node version and run rea doctor.');
    }
  }

  async tools() { return (await this.client.listTools()).tools; }

  async call(tool: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<ReaEvidence> {
    const result = await this.client.callTool({ name: tool, arguments: args }, undefined, { signal, timeout: 300000 });
    if (result.isError) throw new AppError('REA_TOOL_FAILED', `REA tool ${tool} failed. Run the same request with REA for detailed diagnostics.`);
    const evidence = object(result.structuredContent, 'REA structuredContent');
    assert(typeof evidence.evidence_id === 'string' && typeof evidence.operation === 'string'
      && Object.hasOwn(evidence, 'normalized_result'), 'REA_CONTRACT_MISMATCH', 'REA returned an unsupported Evidence envelope');
    assert(evidence.operation === tool, 'REA_CONTRACT_MISMATCH', 'REA Evidence operation did not match the requested tool');
    return evidence as ReaEvidence;
  }

  async close() { await this.client.close().catch(() => {}); }
}
