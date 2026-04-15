---
name: deslop
description: >
  Remove AI-generated slop and do a final pre-commit cleanup pass.
  Use when the user asks to deslop, remove slop, clean up the diff, do a final
  cleanup before commit or PR, sanity-check a nearly finished diff, or make code
  more review-ready without changing behavior. Fan out exactly three focused
  review passes across repo-rule conformance, type/source-of-truth safety, and
  simplification, then apply only the clearly worthwhile fixes.
---

# Deslop

Use this skill after the change is functionally correct and before commit or PR review. The commit or PR should describe already-deslopped code, not code that still needs obvious cleanup.

## Goals

- Leave the smallest clear diff that still solves the task.
- Run three focused review passes instead of one vague final reread.
- Preserve behavior while improving alignment with pi-dash repo rules, type safety, and simplicity.
- Keep changes scoped to the touched packages, routes, and docs.

## Required context bundle

Before delegating, collect the exact paths reviewers need:

- `AGENTS.md`
- nearest nested `AGENTS.md` for touched paths when one exists
  - currently this is especially relevant for `packages/db/src/migrations/AGENTS.md`
- `project-structure.md`
- `ARCHITECTURE.md` when touching auth, Zero, jobs, notifications, uploads, routing, or data flow
- `DEPLOYMENT.md` when touching env vars, Docker, build steps, services, or deployment behavior
- nearest `package.json` for each touched app or package
- any active plan in `docs/plans/` that clearly matches the current work
- changed files plus enough nearby callers, callees, and sibling files to review them in context
- relevant source-of-truth files instead of generated outputs
  - routes: edit route source files, never `apps/web/src/routeTree.gen.ts`
  - schema: edit Drizzle schema under `packages/db/src/schema/`, never `packages/zero/src/schema.ts`
  - design-system components: import via `@pi-dash/design-system/...`, never `src/` deep paths
- relevant skill docs when the change touches their area:
  - `.agents/skills/create-form/SKILL.md`
  - `.agents/skills/create-data-table/SKILL.md`
  - `.agents/skills/create-dialog/SKILL.md`
  - `.agents/skills/add-logging/SKILL.md`
  - `.agents/skills/zero-patterns/SKILL.md`
  - `.agents/skills/e2e-testing/SKILL.md`
  - `.agents/skills/design-context/SKILL.md`
  - `.agents/skills/react-best-practices/SKILL.md`
  - `.agents/skills/react-typescript/SKILL.md`
  - `.agents/skills/typescript-best-practices/SKILL.md`
  - `.agents/skills/tanstack-start-best-practices/SKILL.md`

If one plan doc clearly matches the task, tell every reviewer to read it first.

## Required review vectors

Launch exactly these three focused reviewers as soon as the context bundle is ready. Give all three the same context bundle, but assign one review vector to each.

### 1. Repo rules and architecture conformance

Review for drift from repo rules and documented architecture:

- Are we following `AGENTS.md`, any nested `AGENTS.md`, `project-structure.md`, and `ARCHITECTURE.md`?
- Are permissions and auth patterns correct: `assertHasPermission()`, `can()`, route guards, nav gating, and permission IDs from `packages/db/src/permissions.ts`?
- Are imports using approved surfaces such as `@pi-dash/design-system/...` and `@pi-dash/shared`?
- Did we edit generated files or skip the real source of truth?
- Did the change require doc updates in `README.md`, `.ruler/agent-guide.md`, `project-structure.md`, `ARCHITECTURE.md`, or `DEPLOYMENT.md`?
- Did we invent commands instead of using repo scripts from `package.json`?

### 2. Type safety and source of truth

Review for compile-time guarantees and canonical ownership:

- Are we preserving canonical types instead of redefining, widening, or duplicating them?
- Did we introduce `any`, unsafe casts, duplicate schemas, ad-hoc unions, or needless runtime revalidation inside trusted repo-owned TypeScript?
- Are shared constants and types imported from the correct package?
- Are Zero mutators following repo rules: boundary validation only, `tx.run(zql...)` for reads when possible, and dynamic `import()` only where the repo explicitly requires it?
- Are IDs generated with `uuidv7()` and new permissions added in `packages/db/src/permissions.ts` when needed?
- Could a mistake fail at runtime instead of build time because inference or the canonical source of truth was bypassed?

### 3. Overengineering and simplification

Review for code that is technically fine but needlessly complex:

- Did we write more code than needed?
- Did we create helpers, wrappers, factories, mappers, shims, or indirection without enough payoff?
- Did we leave dead code, placeholder text, debug leftovers, or compatibility layers the repo explicitly does not want?
- In React and Zero code, are we keeping only the memoization and callback boundaries the repo explicitly requires, while avoiding local ceremony that adds no value?
- Can the same result be expressed more directly without widening scope or changing behavior?
- Are we preserving the existing architecture instead of refactoring sideways?

## Delegation protocol

1. Read the context bundle yourself first so delegation is precise.
2. Spawn the three reviewers immediately.
   - Do not wait for linting or tests before delegating.
   - The point is to get three focused reads in parallel while local verification runs.
3. Give each reviewer:
   - the same context bundle
   - the assigned review vector
   - any critical user context not captured in files
   - explicit instructions to return findings first, ordered by severity, with file paths
4. If the harness has no subagent tool, run the same three vectors yourself sequentially and keep the notes separated by vector.
5. While reviewers run, inspect the nearest `package.json` files and run only the smallest relevant validation.
   Common choices in this repo:
   - `bun run check:types`
   - `bun run check`
   - `bun run test:unit`
   - `bun run zero:generate` after Drizzle schema changes
   - `cd packages/e2e && bash run-e2e.sh <spec>` or `bun run test:e2e` for major user flows
6. Wait for all reviewers, then synthesize them into one balanced report with these headings exactly:
   - `How did we do?`
   - `Feedback to keep`
   - `Feedback to ignore`
   - `Plan of attack`
7. Prefer the balanced synthesis over any one reviewer's extreme take.

## What to fix automatically

If the flow is unattended and the fixes are clearly in scope, apply them before commit. Prioritize:

- type drift, unsafe casts, duplicated types, or broken inference
- repo-rule violations from `AGENTS.md` or the architecture docs
- wrong import surfaces, generated-file edits, or edits to the wrong source of truth
- permission or auth drift
- `console.error` where repo logging rules require `evlog`
- direct side-effect calls that should be `enqueue()` or `withFireAndForgetLog()`
- `crypto.randomUUID()` or `Date.now()` idempotency mistakes where repo rules forbid them
- dead helpers, dead code, debug leftovers, placeholder text, or unnecessary wrappers

If feedback is speculative, conflicts across reviewers, or would widen scope materially, leave it out and mention it briefly in the synthesis instead of applying it.

## Steps

1. Confirm the change is already functionally correct enough for a final review-readiness pass.
2. Gather the context bundle.
3. Launch the three required review passes in parallel.
4. While they run, execute the narrowest relevant checks and inspect impacted callers and callees.
5. Read all findings and synthesize them under the required headings.
6. Apply the worthwhile fixes that are clearly in scope.
7. Re-run the narrowest affected validation immediately.
8. Update docs, work notes, and PR or commit text so they describe the final post-deslop state, not the earlier draft.
9. Report changed files and verification results concisely.

## Stop rules

- Do not turn this into an unrelated refactor.
- Do not churn stable code outside the changed area just to make it prettier.
- Do not manually edit generated files.
- Do not add backwards-compat shims, re-exports, type aliases, or `// removed` comments for renamed code.
- If cleanup is subjective and not clearly better, leave it alone.
- Do not blindly apply every reviewer suggestion.
- Do not invent commands that are not present in the repo manifests.
