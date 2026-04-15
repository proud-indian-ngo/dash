---
name: e2e-testing
description: Use when writing, modifying, running, or debugging E2E tests — including failing specs, tests that are not running or not starting, fixture/setup issues, selectors, page objects, and test organization patterns.
---

# E2E Testing

- **When to write**: Major features (new route/page, new CRUD workflow, new role-gated capability). Not for minor UI tweaks or refactors.
- **Selectors**: Use accessibility-first selectors (`getByRole`, `getByLabel`, `getByText`). Use `aria-current="date"` via `getByRole("button", { current: "date" })` for calendar today buttons. Avoid CSS class selectors.
- **Fixtures**: Import `test` and `expect` from `packages/e2e/fixtures/test.ts` for authenticated tests. The `consoleErrors` fixture auto-captures uncaught browser errors as test annotations (visible in the Playwright HTML report). Use plain `@playwright/test` for unauthenticated tests.
- **Page objects**: Use page objects from `packages/e2e/pages/` for request and user tests (`RequestPage`, `ListPage`). Compose `ListPage`, `RequestFormPage`, and `ApprovalDetailPage` for new domains.
- DO: Add E2E tests for new major features covering the happy path and key error states.
- DO: Place tests in the appropriate feature subdirectory under `packages/e2e/tests/`.
- DO: Use page objects from `packages/e2e/pages/` when testing requests.
- DO: Test both admin and volunteer perspectives when the feature is role-gated.
- DO NOT: Write E2E tests for trivial UI changes or refactors.
- DO NOT: Place API authorization tests in `tests/auth/` — use `tests/authorization/` to avoid the volunteer project's `testIgnore` filter.
- DO: Use `ListPage.openRowActionAndClick(row, menuItemName)` for dropdown menu interactions — it retries the full open+click atomically to handle Zero sync re-renders.
- DO: Wait for form population (`await expect(input).toHaveValue(expected)`) before editing inputs in Zero-synced forms to avoid DOM detachment errors.
- DO: Use `test.slow()` for multi-step CRUD tests (create + edit + delete) that need extra timeout.

For E2E structure details (projects, auth state, seeding, env), see `project-structure.md`.
