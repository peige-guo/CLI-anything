#!/usr/bin/env node
import { Command, CommanderError } from 'commander';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Registry } from './registry.js';
import { Runtime } from './runtime.js';
import { defaultAdapters } from './adapters/index.js';
import { loadManifest, validateManifest } from './manifest.js';
import { AppError, errorInfo, assert } from './errors.js';
import { parseJson, object } from './validation.js';
import { serveMcp } from './mcp.js';
import { discoverRea, type DiscoveryReport } from './discovery/rea.js';
import { ReaClient, REA_VERSION } from './rea.js';

const output = (value: unknown): void => {
  const failed = value !== null && typeof value === 'object' && 'status' in value && value.status === 'failed';
  process.stdout.write(JSON.stringify({ ok: !failed, data: value }, null, 2) + '\n');
};
async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(resolve(path)), { recursive: true });
  // Generated artifacts never overwrite existing files silently.
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
}
async function inputJson(value: string) {
  if (value === '-') {
    let text = '';
    for await (const chunk of process.stdin) {
      text += String(chunk);
      assert(Buffer.byteLength(text) <= 1024 * 1024, 'INPUT_LIMIT', 'Input exceeds 1 MiB');
    }
    return parseJson(text);
  }
  const text = value.startsWith('@') ? await readFile(value.slice(1), 'utf8') : value;
  assert(Buffer.byteLength(text) <= 1024 * 1024, 'INPUT_LIMIT', 'Input exceeds 1 MiB');
  return parseJson(text);
}

export async function main(argv = process.argv) {
  const program = new Command().name('cli-anything').version('0.1.0')
    .description('Build verifiable application CLIs on top of REA')
    .option('--registry <path>', 'SQLite registry', process.env.CLI_ANYTHING_REGISTRY ?? '.cli-anything/registry.db')
    .exitOverride();
  const adapters = defaultAdapters();
  let registry: Registry | undefined;
  const getRegistry = () => registry ??= new Registry(resolve(program.opts<{ registry: string }>().registry));
  const runtime = () => new Runtime(getRegistry(), adapters);

  program.command('register <manifest>').description('Import capabilities; approval requires prior review')
    .option('--approve', 'Confirm you reviewed this manifest and trust its adapter configuration')
    .action(async (path: string, options: { approve?: boolean }) => {
      const manifest = await loadManifest(path, adapters);
      const digest = getRegistry().register(manifest, dirname(resolve(path)), options.approve ?? false);
      output({ application: manifest.application.id, approved: options.approve ?? false, digest });
    });
  program.command('apps').description('List registered applications').action(() => output(getRegistry().list()));
  program.command('inspect <app>').action((app: string) => output(getRegistry().get(app)));
  program.command('capabilities <app>').action((app: string) => output(getRegistry().get(app).manifest.capabilities));
  program.command('graph <app>').description('Project the stable capability hierarchy').action((app: string) => {
    const manifest = getRegistry().get(app).manifest;
    const nodes = new Map<string, { id: string; kind: string }>([[app, { id: app, kind: 'application' }]]);
    const edges = new Map<string, { from: string; to: string; relation: string }>();
    for (const capability of manifest.capabilities) {
      let parent = app;
      for (const segment of capability.name.split('.')) {
        const child = `${parent}.${segment}`;
        nodes.set(child, { id: child, kind: child === `${app}.${capability.name}` ? 'capability' : 'namespace' });
        edges.set(child, { from: parent, to: child, relation: 'contains' });
        parent = child;
      }
      for (const binding of capability.bindings) {
        const id = `${parent}#${binding.id}`;
        nodes.set(id, { id, kind: binding.adapter });
        edges.set(id, { from: parent, to: id, relation: 'implemented-by' });
      }
    }
    output({ nodes: [...nodes.values()], edges: [...edges.values()] });
  });
  program.command('execute <app> <capability>').description('Execute one approved capability and verify its outcome')
    .option('--input <json>', 'Inline JSON, @file.json, or - for stdin', '{}')
    .option('--allow-write', 'Allow write capabilities')
    .option('--allow-destructive', 'Allow destructive capabilities')
    .option('--binding <id>', 'Select a specific binding for comparative testing')
    .option('--dry-run', 'Validate and plan without executing an adapter')
    .action(async (app: string, capability: string, options) => {
      const result = await runtime().execute(app, capability, await inputJson(options.input), options);
      output(result);
      if ('status' in result && result.status === 'failed') process.exitCode = 1;
    });
  program.command('verify <execution-id>').description('Read recorded verification evidence; never repeat target effects')
    .action((id: string) => {
      const execution = getRegistry().execution(id);
      output({ historical: true, execution });
      if (!execution.verified) process.exitCode = 1;
    });
  program.command('metrics <app> <capability>').action((app: string, capability: string) => {
    output(getRegistry().metrics(app, capability, getRegistry().get(app).digest));
  });
  program.command('promote <app> <capability> <binding>').description('Prefer a binding with a verified execution against the current manifest')
    .action((app: string, capability: string, binding: string) => output({ digest: getRegistry().promote(app, capability, binding) }));

  const discover = program.command('discover').description('Discover candidate capabilities through REA');
  discover.command('rea <target>').requiredOption('--output <file>', 'New report JSON path')
    .option('--sources <paths...>', 'Exact inventoried source paths to analyze')
    .action(async (target: string, options: { output: string; sources?: string[] }) => {
      const report = await discoverRea(target, options.sources);
      await writeJson(options.output, report);
      output({ report: resolve(options.output), candidates: report.candidates.length, executable: false, evidenceId: report.evidence.evidence_id });
    });
  program.command('generate <report>').description('Combine a discovered surface with an authored, reviewable capability specification')
    .requiredOption('--spec <file>', 'JSON containing application, candidateId and capability')
    .requiredOption('--output <file>', 'New manifest path')
    .action(async (reportPath: string, options: { spec: string; output: string }) => {
      const report = parseJson(await readFile(reportPath, 'utf8')) as DiscoveryReport;
      assert(report.schemaVersion === 1 && report.backend === 'rea' && Array.isArray(report.candidates), 'INVALID_REPORT', 'Expected a CLI Anything REA report');
      const spec = object(parseJson(await readFile(options.spec, 'utf8')));
      assert(report.candidates.some(candidate => candidate.id === spec.candidateId), 'CANDIDATE_NOT_FOUND', 'Specification must select an existing REA candidate ID');
      const capability = object(spec.capability);
      const manifest = await validateManifest({ schemaVersion: 1, application: spec.application, capabilities: [{ ...capability,
        provenance: { backend: 'rea', source: report.evidence.evidence_id, notes: `Candidate ${String(spec.candidateId)} from ${report.target}; binding and verification authored separately` },
      }] }, adapters);
      await writeJson(options.output, manifest);
      output({ manifest: resolve(options.output), approved: false });
    });
  program.command('learn <workflow>').description('Validate and persist an authored semantic UI capability as a candidate manifest')
    .requiredOption('--output <file>', 'New manifest path')
    .action(async (path: string, options: { output: string }) => {
      const manifest = await loadManifest(path, adapters);
      await writeJson(options.output, manifest);
      output({ manifest: resolve(options.output), approved: false, note: 'Authored workflow saved; autonomous GUI exploration is not implemented.' });
    });
  program.command('init <directory>').description('Create a capability manifest and local adapter template')
    .option('--name <name>', 'Application identifier', 'my-app')
    .action(async (directory: string, options: { name: string }) => {
      const manifest = await validateManifest({ schemaVersion: 1,
        application: { id: options.name, name: options.name, version: '0.1.0', description: 'Describe the authorized application capabilities' },
        capabilities: [{ name: 'app.info', description: 'Read application information', effect: 'read', inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          verification: [{ type: 'result', pointer: '/ready', equals: true }],
          bindings: [{ id: 'local', adapter: 'process', config: { command: 'node', args: ['adapter.mjs'], output: 'json' } }],
        }],
      }, adapters);
      await mkdir(directory, { recursive: true });
      await writeJson(resolve(directory, 'manifest.json'), manifest);
      await writeFile(resolve(directory, 'adapter.mjs'), 'process.stdout.write(JSON.stringify({ready:true, name:"Replace with your application SDK"}));\n', { flag: 'wx' });
      output({ manifest: resolve(directory, 'manifest.json') });
    });
  program.command('doctor').description('Check the actual REA MCP connection and tool contracts').action(async () => {
    const rea = new ReaClient();
    try {
      await rea.connect();
      const tools = await rea.tools();
      output({ reaVersion: REA_VERSION, node: process.version, tools: tools.length, discovery: tools.some(tool => tool.name === 'analyze_javascript_application'), browserReplay: tools.some(tool => tool.name === 'capture_browser_scenario') });
    } finally { await rea.close(); }
  });
  program.command('mcp').description('Expose approved capabilities as MCP tools over stdio')
    .option('--allow-write', 'Expose write capabilities in this server session')
    .option('--allow-destructive', 'Expose destructive capabilities in this server session')
    .action(async options => { await serveMcp(runtime(), options); registry = undefined; });

  try { await program.parseAsync(argv); }
  catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return;
    const info = error instanceof CommanderError
      ? { code: 'INVALID_ARGUMENT', message: error.message }
      : errorInfo(error);
    process.stdout.write(JSON.stringify({ ok: false, error: info }) + '\n');
    process.exitCode = error instanceof AppError ? error.exitCode : 1;
  } finally { registry?.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main();
