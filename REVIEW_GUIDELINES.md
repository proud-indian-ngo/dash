# Review guidelines

Project-specific guidance for code review.

## Code priorities

In order: correctness, security, reliability, performance, maintainability, tests, docs. For tests and docs, flag:

- Missing E2E coverage for new routes, CRUD flows or role-gated capabilities. Don't ask for tests of glue code or config.
- `README.md`, `.ruler/agent-guide.md`, `project-structure.md`, the owning `docs/architecture/` chapter or JSDoc left stale by the change.
- New env vars, routes, commands or decisions that went undocumented.
- Docs that break the rules in the agent guide's Documentation section: appended history, copied facts, or a doc pushed over its word budget.

## Feature and UX priorities

Describe every finding as what the user experiences. In order: missing states, flow completeness, validation, accessibility, consistency with similar features, resilience, mobile viewports. Whatever can be created can also be edited and deleted, and destructive actions are confirmed.

## Reviewer rules

- Default to suspicion. Say "looks good" only if you found nothing.
- Don't nitpick formatting.
- Group code findings as 🔴 Must Fix, 🟡 Should Fix and 🔵 Nit, and put feature and UX findings under 🟣 Feature/UX.

## Project skills to enforce

The local skills in `.agents/skills/` (not installed via `skills-lock.json`) are authoritative. When a diff falls in a skill's area, review it against that skill and name the skill in the finding. Don't add requirements the skill doesn't state.

| Skill | Applies to | Flag |
|---|---|---|
| `add-logging` | error handling, `try/catch`, evlog, server functions, fire-and-forget | missing or weak logging; client `catch` blocks without `log.error()` |
| `create-data-table` | tables: columns, row actions, filters, pagination, layout | no `DataTableWrapper`, missing column metadata, non-standard headers or interactions |
| `create-dialog` | dialogs, alerts, confirmations, overlay z-index | missing `DialogTitle`/`DialogDescription`, inconsistent confirmations, no loading state, form dialogs without reset/remount |
| `create-form` | any form | ad hoc `useState`, no Zod, no `FormLayout`/`FormActions`, raw field markup, Zero mutations without `handleMutationResult()` |
| `e2e-testing` | new routes, CRUD flows, role-gated capabilities | missing E2E coverage, weak selectors, ignored fixtures or page objects, wrong directories |
| `zero-patterns` | Zero query hooks, loading and sync states | loading UI gated on `result.type === "unknown"`, derived values gated on loading, unstable refs into `ZeroProvider`, mutator bundling mistakes |
