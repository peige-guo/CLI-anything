import { assert, AppError } from '../errors.js';
import { object, parseJson, string } from '../validation.js';
import { render, scalar } from '../templates.js';
import type { Adapter, AdapterContext, AdapterResult, Capability, Input, Json } from '../types.js';

export class HttpAdapter implements Adapter {
  readonly kind = 'http';

  validate(config: Record<string, unknown>, capability: Capability) {
    assert(Object.keys(config).every(k => ['baseUrl', 'path', 'method', 'headers', 'query', 'body'].includes(k)), 'INVALID_CONFIG', 'Unknown HTTP config field');
    const url = new URL(string(config.baseUrl, 'baseUrl'));
    assert(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash, 'INVALID_CONFIG', 'baseUrl must be HTTP(S) without credentials, query or fragment');
    const path = string(config.path, 'path');
    assert(path.startsWith('/') && !path.startsWith('//') && !/[?#\\]/.test(path) && !path.split('/').some(p => ['.', '..'].includes(p)), 'INVALID_CONFIG', 'HTTP path must be an absolute path without traversal, query or fragment');
    const method = string(config.method, 'method');
    assert(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method), 'INVALID_CONFIG', 'Unsupported HTTP method');
    assert(capability.effect !== 'read' || ['GET', 'HEAD'].includes(method), 'INVALID_CONFIG', 'Mutating HTTP methods cannot be marked read');
    const properties = object(capability.inputSchema.properties ?? {});
    const names = [...path.matchAll(/\{\{([\w-]+)\}\}/g)].map(m => m[1]!);
    assert(config.query === undefined || Array.isArray(config.query) && config.query.every(x => typeof x === 'string'), 'INVALID_CONFIG', 'query must be a string array');
    names.push(...config.query as string[] ?? []);
    if (config.body !== undefined) {
      names.push(string(config.body, 'body'));
      assert(!['GET', 'HEAD'].includes(method), 'INVALID_CONFIG', 'GET and HEAD cannot have bodies');
    }
    for (const name of names) assert(Object.hasOwn(properties, name), 'INVALID_CONFIG', `Undeclared parameter: ${name}`);
    if (config.headers) {
      for (const [name, value] of Object.entries(object(config.headers))) {
        assert(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) && typeof value === 'string' && !/[\r\n]/.test(value), 'INVALID_CONFIG', 'Invalid HTTP header');
      }
    }
  }

  async execute(config: Record<string, unknown>, input: Input, context: AdapterContext): Promise<AdapterResult> {
    const path = render(config.path as string, input, value => {
      assert(!['.', '..'].includes(value), 'INVALID_PARAMETER', 'Path parameters cannot be dot segments');
      return encodeURIComponent(value);
    });
    const url = new URL((config.baseUrl as string).replace(/\/$/, '') + path);
    for (const name of config.query as string[] ?? []) {
      if (Object.hasOwn(input, name)) url.searchParams.set(name, scalar(input[name]!));
    }
    const headers = new Headers({ accept: 'application/json' });
    for (const [name, value] of Object.entries(config.headers as Record<string, string> ?? {})) {
      headers.set(name, value.replace(/\$\{ENV:([A-Z_][A-Z0-9_]*)\}/g, (_, variable: string) => {
        const secret = process.env[variable];
        assert(secret, 'MISSING_ENV', `Required environment variable: ${variable}`);
        return secret;
      }));
    }
    let body: string | undefined;
    if (typeof config.body === 'string' && Object.hasOwn(input, config.body)) {
      body = JSON.stringify(input[config.body]);
      headers.set('content-type', 'application/json');
    }
    const response = await fetch(url, { method: config.method as string, headers, body, signal: context.signal, redirect: 'error' });
    if (!response.ok) {
      await response.body?.cancel();
      throw new AppError('HTTP_ERROR', `Target returned HTTP ${response.status}`);
    }
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.length;
        if (bytes > context.maxOutputBytes) {
          await reader.cancel();
          throw new AppError('OUTPUT_LIMIT', 'HTTP response exceeded the output limit');
        }
        chunks.push(next.value);
      }
    }
    const text = Buffer.concat(chunks).toString('utf8');
    return { data: text ? parseJson(text) as Json : null, evidence: { status: response.status } };
  }
}
