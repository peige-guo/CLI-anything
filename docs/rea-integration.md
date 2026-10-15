# Built on REA

REA is the actual analysis and provider runtime for this project. The integration
uses `rea-agents@6.5.0`, launched with the same Node executable as CLI Anything,
through `scripts/rea.mjs mcp`. It invokes public MCP tools by name and reads the
canonical `structuredContent` Evidence envelope.

The upstream source inspected during implementation is
[`95957d748d8c258933c795f92de7ef99eb6bd2dc`](https://github.com/morluto/rea/tree/95957d748d8c258933c795f92de7ef99eb6bd2dc).
This source reference documents the integration review; it is not a claim that
the published npm tarball is identical to that commit.

## Ownership

| REA owns | CLI Anything adds |
|---|---|
| Static application analysis | Candidate surface projection |
| Canonical Evidence, authority and limitations | Authored capability and parameter contract |
| Browser scenario execution and capture | Stable application CLI and MCP tools |
| Provider sessions and cleanup | Registry, policy and binding selection |
| Engine-specific analysis | Execution postconditions and promotion |

Public contracts consulted: [REA MCP contracts](https://github.com/morluto/rea/blob/main/docs/mcp-contracts.md),
[JavaScript application graph](https://github.com/morluto/rea/blob/main/docs/javascript-application-graph.md),
[browser scenario contract](https://github.com/morluto/rea/blob/main/docs/browser-scenario-contract.md).

## Discovery

`discover rea TARGET --output REPORT` calls `analyze_javascript_application` with
the selected absolute path, format auto, integrity policy fail and complete detail.
An optional source selection is passed through as `source_paths`.

The returned graph is projected into candidates for context bridge APIs, IPC
channels/handlers, endpoints, native exports and managed methods if present.
Candidate IDs are REA node IDs. Observations are preserved rather than inferred
again from source. The complete upstream Evidence remains in the report.

This projection does not cryptographically authenticate an imported portable
Evidence file. It does not infer missing parameter types, claim completeness
from a partial graph, or grant execution rights. A failed upstream analysis fails
discovery rather than silently treating partial findings as a complete report.

## Generate a capability

`generate REPORT --spec SPEC --output MANIFEST` combines an existing candidate
ID with an explicit specification:

```json
{
  "application": { "id": "my-app", "name": "My App", "version": "1.0", "description": "Authorized application automation" },
  "candidateId": "COPY_AN_EXACT_ID_FROM_REPORT",
  "capability": {
    "name": "document.export",
    "description": "Export through a reviewed application bridge",
    "effect": "write",
    "inputSchema": {
      "type": "object",
      "properties": { "output": { "type": "string", "minLength": 1 } },
      "required": ["output"], "additionalProperties": false
    },
    "verification": [{ "type": "file-exists", "path": "{{output}}", "nonEmpty": true }],
    "bindings": [{ "id": "reviewed-bridge", "adapter": "process", "config": { "command": "node", "args": ["bridge.mjs", "{{output}}"], "output": "json" } }]
  }
}
```

Place your reviewed `bridge.mjs` beside the generated manifest. The generator
does not synthesize application-specific bridge code or claim that it invokes
the discovered IPC merely because it has a similar name. Implement and verify
that relationship for the target application. The generated provenance records
the selected candidate and upstream Evidence ID. Files are created exclusively;
an existing output is not overwritten.

## Execute through REA

A `rea` binding declares a fixed tool and reviewed arguments. The included
[browser example](../examples/rea-browser/README.md) reuses
`capture_browser_scenario` against a GUI-only application, then checks the
canonical step result and captured DOM for the expected status.

REA continues to own process/provider cleanup and Evidence semantics. One client
connection is used for each operation, so same-session retained references are
not portable across CLI invocations. Larger investigations can use REA directly,
then supply compatible inline Evidence to authored workflows.

## Updating upstream

1. Inspect REA's changelog, Node requirements and named MCP contracts.
2. Change the pinned dependency and recorded integration metadata deliberately.
3. Run `doctor`, real REA discovery tests and actual REA browser replay tests.
4. Re-review effects, Evidence fields and cleanup behavior before release.

No global `rea setup` or user Agent configuration is changed by the integration.
