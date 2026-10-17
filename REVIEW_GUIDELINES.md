# Review guidelines

Project-specific guidance for code review.

## Code priorities

In order:

1. **Correctness:** logic errors, off-by-ones, races, unhandled edge cases, wrong assumptions about data shape or nullability.
2. **Security:** injection, auth gaps, secrets in code, missing input validation, SSRF/XSS/CSRF.
3. **Reliability:** swallowed errors, resource leaks, unbounded operations, silent failures.
4. **Performance:** N+1 queries, missing indexes implied by query patterns, hot-path allocations, blocking the event loop.
5. **Maintainability:** confusing names, god functions, tight coupling, `any` or unjustified type assertions, dead code.
6. **Tests:**
   - Non-trivial logic or new branches without tests.
   - Existing tests that no longer match the behaviour.
   - Missing E2E coverage for new routes, CRUD flows or role-gated capabilities.
   - Don't ask for tests of glue code or config.
7. **Docs:**
   - `README.md`, `.ruler/agent-guide.md`, `project-structure.md`, the owning `docs/architecture/` chapter or JSDoc left stale by the change.
   - New env vars, routes, commands or decisions that went undocumented.
   - Docs that break the rules in the agent guide's Documentation section: appended history, copied facts, or a doc pushed over its word budget.

## Feature and UX priorities

Describe every finding as what the user experiences.

1. **Missing states:** loading, empty, error, populated; zero items, long text, large numbers.
2. **Flow completeness:**
   - Whatever can be created can also be edited and deleted.
   - Destructive actions are confirmed.
   - The user never reaches a dead end.
3. **Validation:** specific, friendly messages; sensible timing; required fields marked.
4. **Accessibility:** keyboard navigation, screen readers, focus, touch targets, contrast.
5. **Consistency:** matches similar features in the codebase.
6. **Resilience:** slow connections, double submits, navigating away mid-action, concurrent edits, optimistic rollback.
7. **Responsive:** mobile viewports.

## Reviewer rules

- Default to suspicion. Say "looks good" only if you found nothing.
- For each issue, state what is wrong, why it matters and how to fix it.
- Flag code that works now but is fragile or won't scale.
- State your assumptions when the diff lacks context.
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
