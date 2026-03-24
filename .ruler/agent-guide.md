# Agent Guide (Lean)

## Prime Directives

- Make the smallest correct change.
- Verify before claiming success.
- Prefer repo source-of-truth over memory.
- Avoid redundant explanation.
- Preserve existing architecture unless the task asks otherwise.

## Response Contract

- When reporting information to me, be extremely concise and sacrifice grammar for the sake of concision.
- Report findings first, then action, then blockers (if any).
- Include file paths for every code claim.

## Execution Loop

1. Inspect relevant files with `rg` plus targeted reads.
2. Form a minimal plan.
3. Execute the smallest change set.
4. Run only necessary checks.
5. Report delta and verification.

## Guardrails

- DO: Edit source files, not generated outputs.
- DO: Check nearest `package.json` before running scripts.
- DO: Keep changes scoped to affected package(s).
- DO: Import design-system components via `@pi-dash/design-system/components/ui/...` or `@pi-dash/design-system/components/reui/...` — never use `src/` in the import path.
- DO: Use `bun run ui:add <component>` to add new shadcn/ui components to the design system package.
- DO NOT: Edit generated files `apps/web/src/routeTree.gen.ts`, `packages/zero/src/schema.ts`, `packages/db/src/migrations/**/*`, `packages/design-system/components/**/*`, `packages/design-system/lib/utils.ts`, or `packages/design-system/hooks/use-mobile.ts` (all excluded in `biome.jsonc`).
- DO NOT: Invent commands or scripts not in repo manifests.
- DO NOT: Perform broad refactors during focused tasks.
- DO NOT: Add backwards-compatibility shims (re-exports, type aliases, renamed `_vars`, `// removed` comments). This is a new app with no external consumers — delete old code outright.
- DO NOT: Use `Date.now()` in notification idempotency keys — it defeats deduplication. Pass a deterministic timestamp from the mutator instead.
- INSTEAD: For router tree changes, edit route source files and regenerate through app workflow.
- INSTEAD: For Zero schema changes, edit Drizzle schema then run `bun run zero:generate`.
- INSTEAD: For DB schema changes, run `bun run db:generate` then required migrate/push step.
- DO: Use `createRequestLogger()` + `log.set()` / `log.error()` / `log.emit()` from `evlog` for server-side error logging. Never use `console.error` on the server.
- DO NOT: Pass custom fields to `createRequestLogger()` — it only accepts `{ method?, path?, requestId? }`. Use `log.set({ ... })` for context.
- DO NOT: Pass raw `unknown` to `log.error()` — use `error instanceof Error ? error : String(error)`.
- DO: Add maximum context to every `log.set()` call — include all available closure variables (IDs, names, counts, flags, timestamps) so logs are self-contained and debuggable without cross-referencing.
- DO: Use `withTaskLog()` from `@pi-dash/observability` for mutator async tasks — it wraps with retry, evlog, and error handling.
- DO: Use `withFireAndForgetLog()` from `@pi-dash/observability` for fire-and-forget promises — it logs success/failure without re-throwing.
- DO: Use `log.error()` from `evlog` in client-side catch blocks — never use `console.error`. Include component name, action, entity IDs, and error message.
- DO: Use `handleMutationResult()` from `@/lib/mutation-result` for Zero mutation server results instead of inline `if (res.type === "error") { toast.error(...) }`.
- DO NOT: Use `console.error` on the client — use `log.error()` from `evlog` so errors are shipped to the server log drain.

## E2E Testing

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

## Validation and Done

- Definition of done: task goal satisfied.
- Definition of done: changed files listed.
- Definition of done: relevant checks passed, or explicit reason they were not run.
- Definition of done: no generated-file manual edits.
- Definition of done: no stale references introduced.
- Definition of done: E2E tests added for major features.
- Command map: `bun run check:types` — TypeScript type check.
- Command map: `bun run check` — Linter (ultracite/Biome).
- Command map: `bun run fix` — Auto-fix linter issues (ultracite/Biome).
- Command map: `bun run check:unused` — Find unused exports (knip).
- Command map: `bun run test:unit` — Run unit tests (Vitest).
- Command map: `bun run db:generate` — Generate Drizzle types.
- Command map: `bun run zero:generate` — Regenerate Zero schema.
- Command map: `cd packages/e2e && bash run-e2e.sh` — Run E2E tests (full stack).
- Command map: `bun run test:seed` — Seed E2E test data.
- Command map: `bun run test:e2e` — Run E2E tests via Turborepo.
- Command map: `bun run test:e2e:ui` — Run E2E tests in Playwright UI mode.
- Command map: `bun run ruler:apply` — Apply Ruler config.
- Note: lefthook pre-commit hook runs type check, linting, unit tests, and unused-exports check in parallel on commit.
- Note: commitlint enforces conventional commit messages.
- DO NOT: Add `Co-Authored-By`, `Generated by`, or any AI attribution trailers/lines to commit messages.

## Documentation Upkeep

- When completing a major feature, update `README.md` and `.ruler/agent-guide.md` to reflect new instructions.
- When completing a structural change (new routes, env vars, file paths, patterns), update `project-structure.md`.

For project structure, file paths, command map, and architectural patterns, read `project-structure.md`.

## GrepAI Usage Policy

- **Prefer grepai for discovery.** When exploring unfamiliar code or searching by intent (e.g., "how are users authenticated"), use `grepai_search` before falling back to grep/glob.
- **Use grep/glob for exact matches.** For known names (function, class, file), use Grep/Glob directly — grepai is for semantic, not literal search.
- **Use trace tools for impact analysis.** Before modifying shared functions, run `grepai_trace_callers` to find all usage sites. Use `grepai_trace_callees` to understand a function's dependencies.
- **Use `format: "toon"` and `compact: true`** on all grepai tool calls to minimize token usage.
- **Use 3-7 word descriptive queries.** Good: "validate user credentials before login". Bad: "auth" or "getUserById".
- **Read `project-structure.md` for structure questions.** When you need file paths, route tables, or pattern references, read that file rather than searching.

## MCP Usage Policy

- Use Context7 MCP by default for library or API docs, code generation patterns, setup steps, and configuration guidance unless the user explicitly asks not to.
- If knowledge is uncertain or the user questions correctness, use Jina MCP to verify with current sources.
- For deep learning theory or algorithm questions, use `search_arxiv` with `read_url` (or `parallel_read_url`) together.
- For social science, economics, law, or finance research, use `search_ssrn` with `read_url` (or `parallel_read_url`) together.
- Never run `search_web`, `search_arxiv`, or `search_ssrn` alone; every search must be paired with `read_url` or `parallel_read_url`.
- Use parallel search and read variants when multiple sources are needed for speed and coverage.
- For library documentation, use Context7 MCP with library IDs listed in `project-structure.md` § Documentation References.

## Consistency Standards (see skills for detailed guidance)

### Forms
- Always use TanStack Form + Zod schema. Never raw `useState` for form state.
- Use form field components (`InputField`, `SelectField`, etc.) — never raw `<Label>` + `<Input>`.
- Use `FormLayout` + `FormActions`. Use `formKey` remount for dialog reset.
- Use `validators: { onChange: schema, onSubmit: schema }` at the form level. Error display is gated on `isBlurred || submitted` in `getFieldErrorState`, so errors only appear after a field loses focus but clear instantly as the user types a valid value.
- Use `await mutation.server` + `handleMutationResult()` — never `.then()` chains.
- Use `DateField` for date-only inputs, native `<InputField type="datetime-local">` for datetime.
- Invoke the `create-form` skill when creating or modifying forms.

### Data Tables
- Use `DataTableWrapper`. Use `useConfirmAction` for delete confirmations.
- Include `data-testid="row-actions"`, `meta.skeleton`, `visibility={true}`.
- Name storage keys as `{entity}_table_state_v1`.
- Use `formatINR` from `@/lib/form-schemas` for currency formatting.
- Invoke the `create-data-table` skill when creating or modifying tables.

### UI/UX
- Every dialog needs `DialogDescription` (even `sr-only`).
- Use `Loader` component for detail loading. Use `STATUS_BADGE_MAP` for badges.
- Toolbar buttons: "Add {entity}" sentence case + `PlusSignIcon`.
- HugeIcons: always `strokeWidth={2}`. Imports: always `@/` alias. Exports: always named.
- Use `variant="outline"` for secondary/toggle action buttons. Use `gap-6` for detail sections.
- Invoke the `create-dialog` skill when creating dialogs.

### Logging
- Every client `catch` must call `log.error()` — never silent swallow.
- Don't double-wrap with `withTaskLog` in mutators — `mutate.ts` already wraps.
- `log.emit()` on both success and error paths. Maximize `log.set()` context.
- Invoke the `add-logging` skill when adding error handling or server tasks.

## Skills Policy

- Trigger by explicit request or strong task match.
- Do not inline full skill inventory.
- Discovery pointers: `skills-lock.json`, `.agents/skills`, `.claude/skills`.
