import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { Execution, Manifest, RegisteredApp } from './types.js';
import { assert } from './errors.js';

export class Registry {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY, manifest TEXT NOT NULL, source_dir TEXT NOT NULL,
        approved INTEGER NOT NULL, digest TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY, application TEXT NOT NULL, capability TEXT NOT NULL,
        binding TEXT NOT NULL, manifest_digest TEXT NOT NULL, verified INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL, status TEXT NOT NULL, record TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS execution_binding ON executions(application, capability, binding, manifest_digest);
    `);
  }

  register(manifest: Manifest, sourceDir: string, approved = false) {
    const serialized = JSON.stringify(manifest);
    const digest = createHash('sha256').update(serialized).update('\0').update(sourceDir).digest('hex');
    this.db.prepare(`INSERT INTO applications VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET manifest=excluded.manifest, source_dir=excluded.source_dir,
      approved=excluded.approved, digest=excluded.digest`).run(manifest.application.id, serialized, sourceDir, Number(approved), digest);
    return digest;
  }

  get(id: string): RegisteredApp {
    const row = this.db.prepare('SELECT * FROM applications WHERE id=?').get(id);
    assert(row, 'APP_NOT_FOUND', `Application not registered: ${id}`);
    return { manifest: JSON.parse(String(row.manifest)) as Manifest, sourceDir: String(row.source_dir), approved: Boolean(row.approved), digest: String(row.digest) };
  }

  list() {
    return this.db.prepare('SELECT id, approved, digest FROM applications ORDER BY id').all();
  }

  save(execution: Execution) {
    this.db.prepare('INSERT INTO executions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      execution.id, execution.application, execution.capability, execution.binding, execution.manifestDigest,
      Number(execution.verified), execution.durationMs, execution.status, JSON.stringify(execution));
  }

  execution(id: string): Execution {
    const row = this.db.prepare('SELECT record FROM executions WHERE id=?').get(id);
    assert(row, 'EXECUTION_NOT_FOUND', `Unknown execution: ${id}`);
    return JSON.parse(String(row.record)) as Execution;
  }

  metrics(app: string, capability: string, digest: string) {
    return this.db.prepare(`SELECT binding, COUNT(*) AS attempts, SUM(verified) AS verified,
      AVG(duration_ms) AS averageLatencyMs FROM executions
      WHERE application=? AND capability=? AND manifest_digest=? GROUP BY binding`).all(app, capability, digest);
  }

  promote(app: string, capabilityName: string, bindingId: string) {
    const entry = this.get(app);
    assert(entry.approved, 'UNAPPROVED_APP', 'Review and approve the manifest before promoting an adapter');
    const capability = entry.manifest.capabilities.find(c => c.name === capabilityName);
    const binding = capability?.bindings.find(b => b.id === bindingId);
    assert(capability && binding, 'BINDING_NOT_FOUND', 'Unknown capability or binding');
    const verified = this.db.prepare(`SELECT id FROM executions WHERE application=? AND capability=?
      AND binding=? AND manifest_digest=? AND verified=1 AND status='succeeded' LIMIT 1`).get(app, capabilityName, bindingId, entry.digest);
    assert(verified, 'UNVERIFIED_BINDING', 'Execute and verify this binding against the current manifest before promotion');
    binding.priority = Math.max(...capability.bindings.map(b => b.priority)) + 1;
    return this.register(entry.manifest, entry.sourceDir, true);
  }

  close() { this.db.close(); }
}
