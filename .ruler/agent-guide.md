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

## E2E Testing

- **When to write**: Major features (new route/page, new CRUD workflow, new role-gated capability). Not for minor UI tweaks or refactors.
- **Selectors**: Use accessibility-first selectors (`getByRole`, `getByLabel`, `getByText`). Avoid CSS class selectors.
- **Fixtures**: Import `test` and `expect` from `packages/e2e/fixtures/test.ts` for authenticated tests. Use plain `@playwright/test` for unauthenticated tests.
- DO: Add E2E tests for new major features covering the happy path and key error states.
- DO: Place tests in the appropriate feature subdirectory under `packages/e2e/tests/`.
- DO: Test both admin and volunteer perspectives when the feature is role-gated.
- DO NOT: Write E2E tests for trivial UI changes or refactors.

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
- Note: lefthook pre-commit hook runs linting automatically on commit.
- Note: commitlint enforces conventional commit messages.

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

## Skills Policy

- Trigger by explicit request or strong task match.
- Do not inline full skill inventory.
- Discovery pointers: `skills-lock.json`, `.agents/skills`, `.claude/skills`.
