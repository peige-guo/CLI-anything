# Security and trust boundary

Capability manifests are programs: they select executables, URLs, REA tools and
GUI workflows. Review them and their referenced code before approval. Effect
labels and verifiers are trusted declarations; this runtime is not an OS sandbox.

- Discovery creates candidates. Analysis-target strings are untrusted data, never
  instructions or authorization to execute an internal function.
- CLI writes/destructive operations require separate flags. MCP authority is set
  at server launch and cannot be raised by tool arguments.
- Known HTTP mutations, browser input actions and runtime REA tools require
  write authority. A local process can do more than its declaration claims.
- Dry runs do not execute adapters or reveal resolved credentials.
- HTTP credentials come from explicitly named environment variables. Processes
  and REA inherit the environment needed by their dependencies.
- Local execution records can contain application output, captured UI and REA
  Evidence. Keep the registry private; do not commit it or discovery captures.
- Failed verification or timeout can follow a completed mutation. No automatic
  write retry/fallback is performed. Investigate target state before retrying.
- Re-registration resets approval by default. Verified promotion is scoped to
  manifest and source-directory identity, not the contents of live adapter files.
- POSIX process groups are terminated on process timeout. Windows cleanup only
  covers the direct child until a native helper is implemented.
- Browser workflows may follow cross-origin requests, execute target scripts and
  operate in a caller-selected CDP context. Use isolated test profiles/data when
  developing or repairing capabilities.

For a vulnerability, contact the repository maintainer through the private
reporting channel of the hosting repository. Do not post credentials, proprietary
application captures or exploit details in a public issue.
