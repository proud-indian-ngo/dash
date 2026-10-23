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

## Every test must be able to go red

A browser test costs seconds in every role project it runs in, on every CI run. Before adding one, name the regression that would turn it red and that nothing else in the suite would catch.

- **Assert an outcome, not a render.** A test ends on a state a bug would change: a saved value read back after reload, a server refusal, a status transition, a total. Checks that a heading, column, button or dialog appears belong as steps inside the flow that uses them, never as their own test.
- **Extend the test that already reaches the state.** When a flow already creates the record or opens the page, add your assertion as a `test.step` there. A new test earns its own setup only when its setup differs.
- **Run in the roles the outcome depends on.** A check that behaves the same for every role runs as one role. Gate role-specific tests with a skip as the first statement of the test or `beforeEach`, ahead of any navigation, and list a file whose every test is gated to one role in `roleOnlySpecs` (`packages/e2e/project-selection.ts`).
- **Fail when a precondition is missing.** Assert the seed row or fixture exists, then act on it. A skip or an `if` guarded on what the page happens to show turns a broken fixture into a silent pass.
- **Make each assertion discriminate.** A filter step needs a fixture row the filter excludes; content inside a collapsed section needs the section opened first; read back what you saved, not what you typed.
- **Put pure logic in unit tests.** Comparators, filter compilation, date maths and formatting are unit tests next to the code; the E2E test covers the wiring once.
- **Fake external services in the harness.** A test that needs WhatsApp, R2 or another service runs against a local fake started by `run-e2e.sh` and CI (see `packages/e2e/fake-gowa.ts`), so it runs everywhere. A disabled feature's tests are deleted with the feature; git history keeps them.

`packages/e2e/spec-rules.test.ts` enforces the mechanical parts (part of `bun run test:unit`).

For E2E structure details (projects, auth state, seeding, env), see `docs/architecture/e2e-testing.md`.
