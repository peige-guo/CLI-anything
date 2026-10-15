# Project guidelines

CLI Anything is built on REA through its public MCP API. Keep upstream provider
logic in REA. The local layers own capability contracts, approval, registry,
routing, verification and CLI/MCP presentation.

Preserve upstream Evidence and its distinctions between observations, inference
and unknowns. Discovery never authorizes execution. Never infer application
parameter types or safe side effects from a function/channel name alone.

Run `npm run check` for runtime/contract changes. Run `npm run test:browser` for
GUI or REA replay changes. Use supported Node versions. Real-provider claims
require real-provider tests; report unverified platforms clearly.

Do not commit local registry files, discovery captures, proprietary target data,
credentials, binaries, dist or node_modules. Preserve third-party licenses.

Do not automatically retry failed mutations or switch adapters after an uncertain
outcome. Keep generated outputs reviewable and require explicit manifest approval.
