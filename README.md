# CLI Anything

**Build reusable, verifiable application CLIs on top of [REA](https://github.com/morluto/rea).**

[简体中文](README.zh-CN.md) · [Architecture](docs/architecture.md) · [Manifest contract](docs/manifest.md) · [REA integration](docs/rea-integration.md)

CLI Anything extends REA's application analysis and Evidence-producing MCP tools
with a capability registry, stable CLI commands, reusable GUI workflows,
verification and an agent-facing MCP server.

```text
REA discovery → evidence + candidate surfaces → authored capability/binding
                                                  ↓ review
Agent → CLI / MCP → capability registry → adapter → application → verification
                                        ├ REA browser scenarios / analysis
                                        ├ semantic browser workflows / CDP connection
                                        ├ HTTP API
                                        └ local executable / SDK bridge
```

“Anything” is the product direction. Coverage depends on the application's
available interfaces, automation permissions and verifiable outcomes.

## What works today

- Real REA 6.5.0 discovery of local JavaScript/Electron applications and ASARs.
- Candidate extraction from REA's graph, preserving original Evidence,
  observations, authority and limitations.
- Generation of capability manifests from a selected candidate and an authored
  binding, input contract and verifier.
- Reusable GUI workflows with semantic targets, preconditions and postconditions.
- Execution through REA itself, direct Playwright workflows, HTTP, or processes.
- SQLite registry, JSON Schema validation, explicit write/destructive authority,
  execution records and verified adapter promotion.
- CLI and MCP tools generated from the same approved capability contracts.

Autonomous GUI exploration, inferred IPC argument schemas, native desktop
automation adapters and automatic repair are planned. The included examples
are controlled fixtures; they do not establish compatibility with commercial apps.

## Install from source

Use a REA-supported Node release: **22.19+, 24.11+, or 26+** in those major lines.

```bash
npm ci
npm run build
node dist/cli.js doctor
```

REA is a pinned runtime dependency. No REA setup, agent configuration changes,
global installation or commercial decompiler installation is required for these
examples. REA's platform prerequisites still apply: Linux requires compatible
`ps`; macOS may compile its process ownership helper with Xcode Command Line Tools.

For the direct browser adapter and browser tests, install the test browser:

```bash
npx playwright install chromium
```

Run `npm link` if you want the `cli-anything` command in your shell. All examples
below also work with `node dist/cli.js` without a global link.

## First verified command

```bash
node dist/cli.js register examples/process/manifest.json --approve
node dist/cli.js capabilities local-demo
node dist/cli.js execute local-demo app.info
node dist/cli.js execute local-demo text.echo --input '{"text":"Hello Agent"}'
```

`--approve` asserts that you reviewed the manifest and trust its executable,
URLs, effect declarations and verifiers. Registration without it creates a
non-executable candidate. Importing a manifest again resets approval unless
`--approve` is explicitly supplied.

## Turn a GUI-only app into a CLI

Start the local Notes fixture in one terminal:

```bash
npm run demo
```

Then:

```bash
node dist/cli.js register examples/web-notes/manifest.json --approve
node dist/cli.js execute web-notes note.create --input '{"title":"Hello Agent"}' --dry-run
node dist/cli.js execute web-notes note.create --input '{"title":"Hello Agent"}' --allow-write
```

The adapter checks the initial UI, fills a labeled input, clicks a named button
and verifies the application's confirmation. The fixture has no task API and
keeps state only for the current browser session. Repeated CLI calls replay the
saved workflow; no model is involved in execution.

To execute this workflow through REA's own browser provider, use the
[REA browser example](examples/rea-browser/README.md).

## Discover with REA

```bash
node dist/cli.js discover rea tests/fixtures/electron-app --output .cli-anything/discovery.json
```

Replace the target with an authorized application directory or ASAR. For large
applications, use `--sources main.js preload.js` with exact inventoried paths.
The report contains original canonical Evidence and candidate surface IDs.
Static candidates remain non-executable: they do not establish argument types,
runtime reachability or safe side effects.

The next step is to author a capability and select its candidate:

```bash
node dist/cli.js generate .cli-anything/discovery.json --spec reviewed-spec.json --output my-app/manifest.json
node dist/cli.js register my-app/manifest.json
node dist/cli.js inspect my-app
# After reviewing the concrete manifest and its adapter:
node dist/cli.js register my-app/manifest.json --approve
```

See the [generation specification](docs/rea-integration.md#generate-a-capability)
and [manifest contract](docs/manifest.md). Use `init <directory>` for a local SDK
bridge template, or `learn <workflow.json> --output <manifest.json>` to validate
and save an authored UI workflow. `learn` does not perform autonomous exploration.

## Connect an MCP host

Use absolute paths in your host's MCP configuration:

```json
{
  "mcpServers": {
    "cli-anything": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/CLI-anything/dist/cli.js",
        "--registry", "/ABSOLUTE/PATH/TO/registry.db",
        "mcp"
      ]
    }
  }
}
```

Use the same registry path when registering applications. The server exposes
approved read capabilities by default. Add `--allow-write` and/or
`--allow-destructive` to the **server launch arguments** to expose those effects
for that session; tool arguments cannot raise authority. Tool names are stable,
bounded identifiers derived from application/capability identity. Stdout carries
only MCP frames when running as a server.

## Inspect and improve an adapter

```bash
node dist/cli.js graph web-notes
node dist/cli.js execute web-notes note.create --binding semantic-ui --input '{"title":"Comparison run"}' --allow-write
node dist/cli.js verify EXECUTION_ID
node dist/cli.js metrics web-notes note.create
node dist/cli.js promote web-notes note.create semantic-ui
```

Promotion requires a verified execution of that binding against the current
manifest and source-directory identity. It changes routing priority, preserving
the public capability name. Metrics report attempts, verified outcomes and
latency for the current manifest. Routing is deterministic by declared priority;
automatic statistical promotion is future work. Files referenced by process
adapters are trusted live code; their contents are not attested by the manifest
digest. Re-register and retest after changing them.

`verify` reads the historical verification record. It does not rerun a write or
claim the current application state is unchanged. Failed writes are never
automatically retried or routed to another binding.

## Development

```bash
npm run check          # types, core + real REA tests, build
npm run test:browser   # direct GUI workflow + actual REA browser replay
npm pack --dry-run
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and the
[roadmap](docs/roadmap.md). This repository is an alpha integration layer built
against REA's public MCP API. The REA npm dependency is pinned to 6.5.0; upstream
source inspected for integration is recorded in `src/rea.ts`.

## License and attribution

CLI Anything is MIT licensed. REA is created by **morluto** and is separately
MIT licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
[licenses/REA-MIT.txt](licenses/REA-MIT.txt). Third-party engines retain their own
licenses. This package is intended for software you are authorized to operate
and analyze.
