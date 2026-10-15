export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Input = Record<string, Json>;
export type Schema = Record<string, unknown>;
export type Effect = 'read' | 'write' | 'destructive';

export interface Application { id: string; name: string; version: string; description: string }
export interface Binding {
  id: string;
  adapter: string;
  priority: number;
  config: Record<string, unknown>;
}
export type Verification =
  | { type: 'result'; pointer: string; equals: Json }
  | { type: 'result-contains'; pointer: string; contains: string }
  | { type: 'file-exists'; path: string; nonEmpty?: boolean };
export interface Capability {
  name: string;
  description: string;
  effect: Effect;
  inputSchema: Schema;
  outputSchema?: Schema;
  timeoutMs: number;
  verification: Verification[];
  bindings: Binding[];
  provenance?: { backend: string; source: string; notes?: string };
}
export interface Manifest {
  schemaVersion: 1;
  application: Application;
  capabilities: Capability[];
}
export interface RegisteredApp {
  manifest: Manifest;
  sourceDir: string;
  approved: boolean;
  digest: string;
}
export interface AdapterContext {
  cwd: string;
  signal: AbortSignal;
  maxOutputBytes: number;
}
export interface AdapterResult { data: Json; evidence?: Json }
export interface Adapter {
  readonly kind: string;
  validate(config: Record<string, unknown>, capability: Capability): void;
  execute(config: Record<string, unknown>, input: Input, context: AdapterContext): Promise<AdapterResult>;
}
export interface VerificationResult { check: Verification; passed: boolean; detail: string }
export interface Execution {
  id: string;
  application: string;
  capability: string;
  binding: string;
  manifestDigest: string;
  startedAt: string;
  durationMs: number;
  status: 'succeeded' | 'failed';
  verified: boolean;
  data?: Json;
  evidence?: Json;
  checks: VerificationResult[];
  error?: { code: string; message: string };
}
export interface ExecutionOptions { allowWrite?: boolean; allowDestructive?: boolean; binding?: string; dryRun?: boolean }
