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
    if (result.isError) {
      let code = 'unknown';
      let message = 'Inspect the target and REA provider diagnostics.';
      const blocks: unknown[] = Array.isArray(result.content) ? result.content : [];
      const block = blocks.find((item): item is { type: 'text'; text: string } =>
        item !== null && typeof item === 'object' && 'type' in item && item.type === 'text'
        && 'text' in item && typeof item.text === 'string');
      if (block) {
        try {
          const parsed = JSON.parse(block.text) as Record<string, unknown>;
          const diagnostic = parsed.error && typeof parsed.error === 'object'
            ? parsed.error as Record<string, unknown> : parsed;
          if (typeof diagnostic.code === 'string') code = diagnostic.code;
          if (typeof diagnostic.message === 'string') message = diagnostic.message.slice(0, 1000);
        } catch { /* Non-JSON provider errors retain the bounded generic diagnostic. */ }
      }
      const hint = code === 'resource_constraint'
        ? ' Use a smaller analysis root. --sources limits parsing but still inventories the entire root; large retained Evidence requires upstream export or paged views.'
        : '';
      throw new AppError('REA_TOOL_FAILED', `REA ${tool} [${code}]: ${message}${hint}`);
    }
    const evidence = object(result.structuredContent, 'REA structuredContent');
    assert(typeof evidence.evidence_id === 'string' && typeof evidence.operation === 'string'
      && Object.hasOwn(evidence, 'normalized_result'), 'REA_CONTRACT_MISMATCH', 'REA returned an unsupported Evidence envelope');
    assert(evidence.operation === tool, 'REA_CONTRACT_MISMATCH', 'REA Evidence operation did not match the requested tool');
    return evidence as ReaEvidence;
  }

  async close() { await this.client.close().catch(() => {}); }
}
