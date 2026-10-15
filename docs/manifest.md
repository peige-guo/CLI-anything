# Capability manifest

The machine-readable contract is [manifest.schema.json](../schemas/manifest.schema.json).
Input/output schemas use **JSON Schema draft-07**, compiled by AJV in strict mode.
Inputs are not coerced. Input defaults are applied to a clone. Declare
`additionalProperties: false` when undeclared arguments should be rejected.
Formats require explicit support; external schema fetching is not performed.

```json
{
  "schemaVersion": 1,
  "application": { "id": "editor", "name": "Editor", "version": "1.0", "description": "Reviewed editor capabilities" },
  "capabilities": [{
    "name": "document.export",
    "description": "Export the selected document",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": {
        "format": { "type": "string", "enum": ["png", "pdf"] },
        "output": { "type": "string", "minLength": 1 }
      },
      "required": ["format", "output"],
      "additionalProperties": false
    },
    "timeoutMs": 30000,
    "verification": [{ "type": "file-exists", "path": "{{output}}", "nonEmpty": true }],
    "bindings": [{
      "id": "sdk", "adapter": "process", "priority": 10,
      "config": { "command": "node", "args": ["export-bridge.mjs", "{{format}}", "{{output}}"], "output": "json" }
    }]
  }]
}
```

This example requires you to implement `export-bridge.mjs` for the target editor.
A file existence check can pass for a stale file; use unique output paths or a
stronger application-specific verifier for real exports.

## Effects and lifecycle

`read`, `write`, and `destructive` are reviewed metadata. Known HTTP mutations,
UI input actions and runtime REA tools cannot be labeled read. Other executable
effects cannot be inferred by this framework. Approval trusts the author.

Each capability requires at least one binding and at least one verifier.
Timeouts are in milliseconds, between 1 and 300000 (default 30000). Binding
priority defaults to 0. Unknown manifest fields and duplicate names/IDs fail
validation. Candidate import and approved import use the same schema.

## Adapter configurations

### `rea`

```json
{ "tool": "analyze_javascript_application", "arguments": { "input_path": "{{path}}", "format": "auto", "integrity_policy": "fail" } }
```

The tool name is fixed. An exact `{{parameter}}` value preserves JSON type,
including arrays and objects. Embedded placeholders require scalar values.
`data` is `structuredContent.normalized_result`; `evidence` is the preserved
canonical record. Runtime/UI tools require write or destructive authority.
Sessions are created and closed for each execution. Retained references from
another session cannot be reused; use compatible portable inline Evidence.
Arguments are finally validated by REA's named tool contract.

### `browser`

```json
{
  "url": "http://127.0.0.1:3100", "headless": true,
  "preconditions": [{ "target": { "testId": "notes-app" }, "state": "visible" }],
  "steps": [
    { "action": "fill", "target": { "label": "Note title" }, "value": "{{title}}" },
    { "action": "click", "target": { "role": "button", "name": "Add note" } },
    { "action": "read", "target": { "testId": "status" }, "as": "status" }
  ],
  "postconditions": [{ "target": { "testId": "status" }, "state": "text", "text": "Created: {{title}}" }]
}
```

Targets use exactly one of `testId`, `label`, or `role` plus `name`. Matching
is exact; ambiguous targets fail. Actions are `click`, `fill`, `press`, `read`.
Conditions are `visible`, `hidden`, or `text`. All workflows require initial
and final conditions; coordinate-only macros are unsupported. Read result fields
reflect the corresponding read step. The final `verified` flag is true only after
UI postconditions pass. For asynchronous UIs, place reads where the application
state is ready, or use a stronger workflow/provider contract.

Optional `cdpEndpoint` attaches to an explicitly supplied browser endpoint,
creates a dedicated tab in its first browser context and closes that tab after
the call. It disconnects from the external browser. Without CDP, each execution
launches and closes a fresh browser. Browser requests and redirects can reach
other origins; there is no network sandbox or origin policy in this adapter.

### `http`

```json
{
  "baseUrl": "https://example.test/api", "path": "/notes/{{id}}", "method": "GET",
  "query": ["limit"], "headers": { "Authorization": "Bearer ${ENV:APP_TOKEN}" }
}
```

Path values are URL-encoded; dot-segment input is refused. Query values must
be scalar. `body` optionally names a JSON input parameter. Redirects are refused.
Credentials are read from explicitly named environment variables at execution.
Store no literal secrets in manifests. The adapter accepts JSON responses and
empty responses (null); non-JSON responses fail parsing.

### `process`

```json
{ "command": "node", "args": ["bridge.mjs", "{{text}}"], "output": "json" }
```

The executable is fixed; placeholders must occupy an entire argument. No shell
is invoked. The process runs in the manifest's source directory, inheriting the
process environment. `output` is `json` or `text`. Combined stdout/stderr is
limited to 1 MiB; captured stderr is not returned. Timeout terminates the owned
process group on POSIX and the direct child on Windows. Descendant cleanup on
Windows requires a future native process helper.

## Verification

- `result`: compare a JSON Pointer with a literal JSON `equals` value.
- `result-contains`: check captured text at a JSON Pointer for a `contains`
  string; scalar `{{parameter}}` substitutions are supported.
- `file-exists`: check a rendered path relative to the manifest source directory
  (or an explicit absolute path); optionally require `nonEmpty`.

These checks establish only their declared conditions. No check automatically
confirms semantic correctness of arbitrary application output.

`execute --input` accepts inline JSON, `@file.json`, or `-` for stdin. Plans
validate input but do not return argument values or resolved credentials.
Execution records may contain application output and Evidence; treat the
registry as local application data. `verify ID` reports historical checks.
