# Review Guidelines

Use this file for project-specific and workflow-specific code review guidance.

## Review priorities

Review in this order:

1. **Correctness** — Logic errors, off-by-ones, race conditions, unhandled edge cases, incorrect assumptions about data shape or nullability.
2. **Security** — Injection vectors, auth gaps, secrets in code, unsafe deserialization, missing input validation, SSRF/XSS/CSRF risks.
3. **Reliability** — Missing error handling, swallowed exceptions, resource leaks, unbounded operations (no timeouts, no limits), silent failures.
4. **Performance** — N+1 queries, unnecessary allocations in hot paths, missing indexes implied by query patterns, blocking event loop.
5. **Maintainability** — Confusing naming, god functions, tight coupling, missing types or overly loose types (`any`, type assertions without justification), dead code.
6. **Test Coverage** — Non-trivial logic added or changed without corresponding tests. New branches, edge cases, or error paths that are not exercised. Existing tests that should be updated to cover changed behavior. Missing E2E tests for major features such as new routes, CRUD workflows, or role-gated capabilities. Do not demand tests for trivial glue code, pure config, or simple pass-throughs.
7. **Documentation** — `README.md`, `.ruler/agent-guide.md`, `project-structure.md`, or inline doc comments that are stale or incomplete because of reviewed changes. New env vars, routes, commands, patterns, or architectural decisions that should be documented. Missing or outdated JSDoc on public APIs. Do not flag missing docs for internal helpers or obvious code.

## Feature and UX review priorities

Review changes from user's perspective, not only developer's perspective.

1. **Missing UI states** — Every view should handle loading, empty, error, and populated states. Check 0 items, long text, large numbers, and unexpected data shapes. Check for skeleton or placeholder states during data fetches.
2. **UX flow completeness** — If user can create something, check whether they can also edit and delete it. Check destructive confirmations, undo or recovery paths, happy path completeness, and dead ends where user gets stuck.
3. **Form validation and error messages** — Validate all user inputs. Error messages should be user-friendly and specific, not vague. Validation timing should make sense. Required fields should be marked.
4. **Accessibility** — Check keyboard navigation, screen reader support, focus management, touch target size, and color contrast.
5. **Consistency with existing patterns** — Compare with similar features in codebase. Check component composition, naming conventions, and interaction patterns.
6. **Edge cases and resilience** — Check slow connections, double submits, navigation-away mid-action, concurrent edits, and optimistic updates with rollback.
7. **Responsive and cross-context behavior** — Check mobile viewports and behavior across screen sizes.

For Feature/UX issues, always describe user-visible consequence — what user experiences, not only what code does wrong.

## Reviewer rules

- Never say "looks good" unless you genuinely found zero issues. Default to suspicion.
- For every issue, state **what** is wrong, **why** it matters, and **how** to fix it.
- Call out code that works now but is fragile under reasonable future changes.
- If a pattern works now but does not scale, say so.
- Flag missing tests for any non-trivial logic. Check whether existing tests need updates for changed behavior.
- Flag stale or missing docs caused by reviewed changes.
- If diff is incomplete or lacks context, state assumptions clearly.
- Do not nitpick formatting or style unless it obscures meaning.
- Group code findings by severity: 🔴 Must Fix, 🟡 Should Fix, 🔵 Nit.
- Group feature and UX findings separately under 🟣 Feature/UX.

## Project-local custom skill conformance

This repo has project-local custom skills in `.agents/skills/` that are **not** installed via `skills-lock.json`. Treat these as authoritative local implementation guides when reviewing matching work. If a change touches one of these areas and does not follow the skill's required patterns, flag it.

### Skills to enforce during review

1. **`add-logging`**
   - Applies to added or modified error handling, `try/catch`, structured logging, `evlog`, server function logging, and fire-and-forget operations.
   - Flag missing or weak logging, especially client `catch` blocks that should call `log.error()` and server-side changes that should follow structured logging patterns.

2. **`create-data-table`**
   - Applies to data-table work: columns, row actions, filters, sorting, pagination, layout, responsiveness, and table consistency work.
   - Flag tables that do not use `DataTableWrapper`, miss standard column metadata, skip standard header patterns, or diverge from established table interactions.

3. **`create-dialog`**
   - Applies to dialogs, modals, alert dialogs, confirmation dialogs, and overlay/z-index issues.
   - Flag missing `DialogTitle` / `DialogDescription`, inconsistent confirmation patterns, missing loading states, or form dialogs that skip reset/remount patterns.

4. **`create-form`**
   - Applies to any form, including dialog forms, validation work, auth forms, settings forms, and field behavior fixes.
   - Flag forms that use ad hoc `useState` instead of `useForm`, skip Zod validation, skip `FormLayout` / `FormActions`, use raw field markup instead of shared field components, or bypass `handleMutationResult()` for Zero mutations.

5. **`e2e-testing`**
   - Applies when changes add major features such as new routes/pages, CRUD workflows, or role-gated capabilities.
   - Flag missing E2E coverage for major features, bad selector strategy, ignoring shared fixtures/page objects, or tests placed in wrong directories.

6. **`zero-patterns`**
   - Applies to Zero query hooks, Zero-derived loading states, sync-state handling, and data-derived UI computations.
   - Flag loading UI gated on `result.type === "unknown"`, derived values gated on loading state, unstable refs passed into `ZeroProvider` boundaries, or missed bundling rules around mutators.

### Review rule for custom skills

- When a diff clearly matches one of skills above, review against that skill's checklist and patterns, not only generic engineering taste.
- If a change should have used one of these project-local skills and did not follow it, call that out explicitly in finding and name relevant skill.
- Do not invent requirements beyond skill guidance; enforce actual local patterns, not generic preference.
