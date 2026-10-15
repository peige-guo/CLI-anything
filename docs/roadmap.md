# Roadmap and acceptance criteria

## Current alpha

Real REA discovery and browser replay, authored semantic GUI workflows, capability
schema/graph, SQLite registry, CLI/MCP, input/output validation, postconditions,
execution records and explicit verified binding promotion.

## Phase 1: application coverage

- One Web app, one Electron app, one native desktop app.
- At least five verified capabilities per app, including a mutation with an
  application-observed postcondition and a recoverable failure.
- Version and target identity checks, state management, isolated test data.
- CI contracts plus real host acceptance tests for every claimed platform.

Current controlled fixtures establish the core path. They do not complete this
phase's three-app acceptance target.

## Phase 2: discovery and interface upgrades

- GUI exploration that proposes semantic workflows and explicit unknowns.
- Reviewed CDP/IPC/COM/SDK bridges with parameter and side-effect contracts.
- Comparative tests before upgrading a GUI capability to a faster interface.
- Confidence and compatibility metrics beyond manually declared priorities.

## Phase 3: deeper REA integration

- Native and managed-code discovery backends using named REA tools.
- Same-session investigation service for retained Evidence and feature tracing.
- Authenticated evidence exchange and source/adapter content attestation.
- Adapter generation from confirmed call relationships and reviewed contracts.

## Phase 4: maintenance

- Detect application version/interface drift and invalidate affected bindings.
- Generate candidate repairs and evaluate them against isolated data.
- Explicit promotion with evidence; uncertain mutation outcomes remain actionable.
- Native accessibility and vision recovery with preserved target identity.
