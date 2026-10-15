import { resolve } from 'node:path';
import { ReaClient, REA_SOURCE_COMMIT, REA_UPSTREAM, REA_VERSION, type ReaEvidence } from '../rea.js';
import { object } from '../validation.js';
import { assert } from '../errors.js';
import type { Json } from '../types.js';

const SURFACES = new Set(['context-bridge-api', 'ipc-channel', 'ipc-handler', 'endpoint', 'native-export', 'managed-method']);

export interface DiscoveryReport {
  schemaVersion: 1;
  backend: 'rea';
  rea: { version: string; repository: string; inspectedSourceCommit: string };
  target: string;
  evidence: ReaEvidence;
  candidates: { id: string; kind: string; labels: Json[]; observations: Json[]; status: 'candidate'; executable: false }[];
  limitations: string[];
}

/** Producer-owned graph fields are projected without re-parsing target source. */
export function reportFromEvidence(evidence: ReaEvidence, target: string): DiscoveryReport {
  assert(evidence.operation === 'analyze_javascript_application', 'REA_CONTRACT_MISMATCH', 'Expected JavaScript application Evidence');
  const result = object(evidence.normalized_result, 'normalized_result');
  const graph = object(result.graph, 'graph');
  assert(Array.isArray(graph.nodes), 'REA_CONTRACT_MISMATCH', 'REA graph nodes are unavailable');
  const candidates: DiscoveryReport['candidates'] = [];
  for (const raw of graph.nodes) {
    const node = object(raw, 'node');
    if (!SURFACES.has(String(node.kind))) continue;
    assert(typeof node.node_id === 'string' && Array.isArray(node.observations), 'REA_CONTRACT_MISMATCH', 'Malformed application surface');
    const observations = node.observations.map(item => object(item, 'observation'));
    candidates.push({ id: node.node_id, kind: String(node.kind), labels: observations.map(item => item.label as Json), observations: observations as Json[], status: 'candidate', executable: false });
  }
  return {
    schemaVersion: 1, backend: 'rea', rea: { version: REA_VERSION, repository: REA_UPSTREAM, inspectedSourceCommit: REA_SOURCE_COMMIT },
    target, evidence, candidates,
    limitations: [
      'Static findings are candidates. Parameter shapes, side effects and runtime reachability require review and testing.',
      'This report grants no execution authority and does not authenticate portable Evidence. Original REA Evidence is preserved.',
      ...Array.isArray(result.limitations) ? result.limitations.filter((x): x is string => typeof x === 'string') : [],
      ...Array.isArray(graph.limitations) ? graph.limitations.filter((x): x is string => typeof x === 'string') : [],
    ],
  };
}

export async function discoverRea(target: string, sources?: string[]): Promise<DiscoveryReport> {
  const client = new ReaClient();
  try {
    await client.connect();
    const evidence = await client.call('analyze_javascript_application', {
      input_path: resolve(target), format: 'auto', integrity_policy: 'fail', detail: 'complete',
      ...(sources ? { source_paths: sources } : {}),
    });
    return reportFromEvidence(evidence, resolve(target));
  } finally { await client.close(); }
}
