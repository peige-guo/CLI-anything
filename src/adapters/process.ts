import { spawn } from 'node:child_process';
import { assert, AppError } from '../errors.js';
import { object, parseJson, string } from '../validation.js';
import { parameterPattern, render } from '../templates.js';
import type { Adapter, AdapterContext, AdapterResult, Capability, Input, Json } from '../types.js';

export class ProcessAdapter implements Adapter {
  readonly kind = 'process';

  validate(raw: Record<string, unknown>, capability: Capability) {
    const config = object(raw);
    assert(Object.keys(config).every(k => ['command', 'args', 'output'].includes(k)), 'INVALID_CONFIG', 'Unknown process config field');
    const command = string(config.command, 'command');
    assert(!command.includes('{{'), 'INVALID_CONFIG', 'The executable must be fixed');
    assert(Array.isArray(config.args) && config.args.every(x => typeof x === 'string'), 'INVALID_CONFIG', 'args must be a string array');
    assert(config.output === 'json' || config.output === 'text', 'INVALID_CONFIG', 'output must be json or text');
    const properties = object(capability.inputSchema.properties ?? {});
    for (const arg of config.args as string[]) {
      for (const match of arg.matchAll(parameterPattern)) {
        assert(Object.hasOwn(properties, match[1]!), 'INVALID_CONFIG', `Undeclared parameter: ${match[1]}`);
        assert(arg === match[0], 'INVALID_CONFIG', 'Process placeholders must occupy an entire argument');
      }
    }
  }

  async execute(config: Record<string, unknown>, input: Input, context: AdapterContext): Promise<AdapterResult> {
    const args = (config.args as string[]).map(arg => render(arg, input));
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(config.command as string, args, {
        cwd: context.cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      });
      const chunks: Buffer[] = [];
      let bytes = 0;
      let failure: AppError | undefined;
      const kill = () => {
        try {
          if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
          else child.kill('SIGKILL');
        } catch { /* Child may have exited between observation and cancellation. */ }
      };
      const abort = () => { failure ??= new AppError('TIMEOUT', 'Process execution was cancelled or timed out'); kill(); };
      if (context.signal.aborted) abort();
      else context.signal.addEventListener('abort', abort, { once: true });
      const receive = (chunk: Buffer, stdout: boolean) => {
        bytes += chunk.length;
        if (bytes > context.maxOutputBytes) {
          failure ??= new AppError('OUTPUT_LIMIT', 'Process exceeded the output limit');
          kill();
        } else if (stdout) chunks.push(chunk);
      };
      child.stdout.on('data', (chunk: Buffer) => receive(chunk, true));
      child.stderr.on('data', (chunk: Buffer) => receive(chunk, false));
      child.on('error', () => { failure ??= new AppError('PROCESS_ERROR', 'Could not start the configured executable'); });
      child.on('close', code => {
        context.signal.removeEventListener('abort', abort);
        if (failure) reject(failure);
        else if (code !== 0) reject(new AppError('PROCESS_ERROR', `Process exited with code ${code}`));
        else resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    return { data: config.output === 'json' ? parseJson(output) as Json : output.trimEnd() };
  }
}
