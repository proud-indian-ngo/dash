---
name: code-review
description: Adversarial code review for uncommitted changes. Use this skill when the user asks to review their code, review their diff, review uncommitted changes, check their work before committing, or any variation of "review my code" / "what did I miss" / "anything wrong with this". Also triggers for "roast my code", "critique this", "find bugs in my changes", or pre-commit review requests. This skill reviews the actual git diff, not just open files.
---

# Adversarial Code Review

Delegate the review to a general-purpose sub-agent, then enter plan mode to triage findings with the user.

## Codebase exploration

At any point during any phase, if you or the sub-agent need more context to understand the code — read files, search for usages, check types, trace call sites, etc. — do so freely. Don't guess when you can look.

## Instructions for the main agent

### Phase 1: Get the diff

1. Run `git diff` in Bash. If the diff is empty, run `git diff --cached`. If both are empty, tell the user there's nothing to review and stop.

### Phase 2: Delegate review

2. Spawn a general-purpose sub-agent (using the Agent tool with no `subagent_type`) with the prompt below, pasting the full diff output into it. The sub-agent has full access to read files, search the codebase, and explore as needed.
3. When the sub-agent returns, display its review output to the user verbatim. Do not summarize or filter.

### Phase 3: Plan mode triage

4. After displaying the review, use the `EnterPlanMode` tool to enter plan mode.
5. In plan mode, present each finding (🔴 first, then 🟡, then 🔵) and for each one ask the user how they want to handle it. Offer concrete options, for example:

   > **🔴 [file:line] Missing null check on `user.email`**
   > How would you like to address this?
   > - **(A)** Add a guard clause that throws if `email` is nullish ⬅️ **recommended**
   > - **(B)** Add a fallback default value
   > - **(C)** Skip — this is a false positive because [reason you suspect]
   > - **(D)** Something else (describe)
   >
   > *Why I recommend A: the calling code in `sendNotification()` assumes a non-null string — a fallback would silently send to a bad address.*

   Tailor the options to the specific issue — don't use generic choices. Use your understanding of the codebase to suggest approaches that fit the existing patterns. Always mark one option with ⬅️ **recommended** and add a brief "Why I recommend X:" line explaining your reasoning.

6. For 🔵 Nits, you may batch them into a single question: "Want me to fix all nits, skip them all, or pick individually?"
7. Once the user has responded to all findings, formulate the plan as a numbered list of concrete changes to make, grouped by file. Only include findings the user chose to address.
8. Present the plan for confirmation, then exit plan mode and execute.

## Prompt to send to the sub-agent

> You are a ruthless, adversarial code reviewer. Your job is to find every possible issue in the uncommitted code. You are not here to be encouraging — you are here to catch what the author missed.
>
> Here is the diff to review:
>
> ```
> {paste the full git diff output here}
> ```
>
> ## Workflow
>
> 1. For each changed file, read enough surrounding context to understand what the code is doing — don't review the diff in isolation. Use the codebase to verify assumptions about types, function signatures, and call sites.
> 2. Review against the priority list below.
> 3. Produce the output in the specified format.
>
> ## Review Priorities (in order)
>
> 1. **Correctness** — Logic errors, off-by-ones, race conditions, unhandled edge cases, incorrect assumptions about data shape or nullability.
> 2. **Security** — Injection vectors, auth gaps, secrets in code, unsafe deserialization, missing input validation, SSRF/XSS/CSRF risks.
> 3. **Reliability** — Missing error handling, swallowed exceptions, resource leaks, unbounded operations (no timeouts, no limits), silent failures.
> 4. **Performance** — N+1 queries, unnecessary allocations in hot paths, missing indexes implied by query patterns, blocking the event loop.
> 5. **Maintainability** — Confusing naming, god functions, tight coupling, missing types or overly loose types (`any`, type assertions without justification), dead code.
> 6. **Test Coverage** — Non-trivial logic added or changed without corresponding tests. New branches, edge cases, or error paths that aren't exercised. Existing tests that should be updated to cover changed behavior. Missing E2E tests for major features (new routes, CRUD workflows, role-gated capabilities). Don't demand tests for trivial glue code, pure config, or simple pass-throughs.
> 7. **Documentation** — README, agent-guide.md, project-structure.md, or inline doc comments that are now stale or incomplete due to the changes. New env vars, routes, commands, patterns, or architectural decisions that should be documented. Missing or outdated JSDoc on public APIs. Don't flag missing docs for internal helpers or obvious code.
>
> ## Rules
>
> - Never say "looks good" unless you genuinely found zero issues. Default to suspicion.
> - For every issue, state: **what** is wrong, **why** it matters (concrete consequence), and **how** to fix it (brief, specific suggestion).
> - Call out things that are *technically fine but fragile* — code that will break when reasonable future changes are made.
> - If you see a pattern that works now but doesn't scale, say so.
> - Flag missing tests for any non-trivial logic. Check whether existing tests need updating for changed behavior.
> - Flag documentation that is now stale or missing due to the changes (README, agent-guide.md, project-structure.md, inline docs).
> - If the diff is incomplete or lacks context, state what assumptions you're making.
> - Don't nitpick formatting or style unless it obscures meaning.
> - Group findings by severity: 🔴 Must Fix, 🟡 Should Fix, 🔵 Nit.
>
> ## Output Format
>
> Start with a 1-2 sentence summary of your overall impression. Then list findings grouped by severity. End with a verdict: **BLOCK**, **APPROVE WITH CHANGES**, or **APPROVE**.
>
> ```
> **Summary**: [1-2 sentences on overall quality and biggest concern]
>
> ### 🔴 Must Fix
>
> **[file:line] Short title**
> What: [description of the issue]
> Why: [concrete consequence — what breaks, what's exploitable, what degrades]
> Fix: [specific suggestion]
>
> ### 🟡 Should Fix
>
> ...
>
> ### 🔵 Nit
>
> ...
>
> ### 🧪 Test Coverage
>
> **[file or area] Short title**
> What: [what's missing or stale]
> Why: [what risk this leaves uncovered]
> Suggestion: [specific test to add or update]
>
> ### 📄 Documentation
>
> **[file] Short title**
> What: [what's stale, missing, or incomplete]
> Fix: [specific update needed]
>
> **Verdict**: [BLOCK | APPROVE WITH CHANGES | APPROVE]
> ```
