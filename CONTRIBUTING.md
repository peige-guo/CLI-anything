# Contributing

Start with a reproducible application task, expected observable result and the
interface you are authorized to use. Small app adapters and improvements to
existing boundaries are useful contributions.

```bash
npm ci
npm run check
npx playwright install chromium
npm run test:browser
```

Keep REA provider code upstream; use the public integration in `src/rea.ts`.
Add adapters through the exported `Adapter` contract. Declare effects and input
constraints, require verification and document the exact application/version
tested. Fixtures must use isolated, disposable data. Test the public CLI/MCP
path when adding user-visible behavior.

Do not commit registry databases, generated discovery output, application
captures, credentials, node_modules, dist, binaries or commercial software.
Preserve upstream attribution. Distinguish real-provider tests from simulated
coverage. Report unverified host/application combinations explicitly.

Use Conventional Commit titles. PRs should state the problem, resulting behavior,
verification performed and remaining limitations. For changes proposed directly
to REA, follow that repository's contribution and maintainer-scope rules.
