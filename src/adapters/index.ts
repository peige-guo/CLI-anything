import type { Adapter } from '../types.js';
import { BrowserAdapter } from './browser.js';
import { HttpAdapter } from './http.js';
import { ProcessAdapter } from './process.js';
import { ReaAdapter } from './rea.js';

export function defaultAdapters(): Map<string, Adapter> {
  const adapters: Adapter[] = [new ReaAdapter(), new BrowserAdapter(), new HttpAdapter(), new ProcessAdapter()];
  return new Map(adapters.map(adapter => [adapter.kind, adapter]));
}
