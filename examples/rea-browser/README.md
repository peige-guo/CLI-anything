This example uses **REA's actual browser-scenario provider** as the execution
adapter. Start the GUI fixture (`npm run demo`), copy `manifest.template.json` to
`manifest.json`, and replace `/ABSOLUTE/PATH/TO/CHROMIUM` with an installed browser.

Review, register and execute:

```bash
node dist/cli.js register examples/rea-browser/manifest.json --approve
node dist/cli.js execute rea-notes note.create --input '{"title":"Created through REA"}' --allow-write
```

REA returns canonical Evidence, including step-indexed DOM captures and cleanup
facts. CLI Anything verifies the final step completed and that its captured DOM
contains the expected application confirmation. The title is deliberately limited
to plain text characters so the fixture's HTML check has an exact representation. This is a
reviewed workflow for a controlled fixture, not an automatically inferred API.
