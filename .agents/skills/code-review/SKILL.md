---
name: code-review
description: Adversarial code review for uncommitted changes. Use this skill when the user asks to review their code, review their diff, review uncommitted changes, check their work before committing, or any variation of "review my code" / "what did I miss" / "anything wrong with this". Also triggers for "roast my code", "critique this", "find bugs in my changes", or pre-commit review requests. This skill reviews the actual git diff, not just open files.
---

# Adversarial Code Review

Delegate the review to a general-purpose sub-agent, then triage findings with the user via AskUserQuestion.

## Codebase exploration

At any point during any phase, if you or the sub-agent need more context to understand the code — read files, search for usages, check types, trace call sites, etc. — do so freely. Don't guess when you can look.

## Instructions for the main agent

### Phase 1: Get the diff

1. Run `git diff` in Bash. If the diff is empty, run `git diff --cached`. If both are empty, tell the user there's nothing to review and stop.

### Phase 2: Delegate review

2. Spawn a general-purpose sub-agent (using the Agent tool with no `subagent_type`) with the prompt below, pasting the full diff output into it. The sub-agent has full access to read files, search the codebase, and explore as needed.
3. When the sub-agent returns, display its review output to the user verbatim. Do not summarize or filter.

### Phase 3: Triage

4. After displaying the review, triage findings with the user using **AskUserQuestion**. Group findings into logical batches and present one batch at a time.

**Grouping rules:**
- Group by theme/area (e.g., all findings about the same component, same file, or same concern type).
- Each batch should have 1-3 findings max. Never dump all findings at once.
- Present 🔴 Must Fix items first, then 🟣 Feature/UX, then 🟡 Should Fix, then 🔵 Nit.
- For 🔵 Nits, batch them all into one question: "Want me to fix all nits, skip them all, or pick individually?"

**For each finding in a batch, present:**

> **🔴 [file:line] Missing null check on `user.email`**
> How would you like to address this?
> - **(A)** Add a guard clause that throws if `email` is nullish ⬅️ **recommended**
> - **(B)** Add a fallback default value
> - **(C)** Skip — this is a false positive because [reason you suspect]
> - **(D)** Something else (describe)
>
> *Why I recommend A: the calling code in `sendNotification()` assumes a non-null string — a fallback would silently send to a bad address.*

Tailor the options to the specific issue — don't use generic choices. Use your understanding of the codebase to suggest approaches that fit the existing patterns. Always mark one option with ⬅️ **recommended** and add a brief "Why I recommend X:" line explaining your reasoning.

5. After the user responds to a batch, move to the next batch. Continue until all findings are triaged.
6. Once all findings are triaged, present a summary plan as a numbered list of concrete changes grouped by file. Only include findings the user chose to address. Ask the user to confirm, then execute.

## Prompt to send to the sub-agent

> You are a ruthless, adversarial code reviewer who also thinks like a product designer. Your job is to find every possible issue in the uncommitted code — bugs, security holes, AND feature gaps, UX problems, missing states, and inconsistencies.
>
> Here is the diff to review:
>
> ```
> {paste the full git diff output here}
> ```
>
> ## Workflow
>
> 1. **Understand intent first.** Read the full diff, then read enough surrounding code, types, and call sites to understand what the author is trying to accomplish. Form a clear picture of the feature or change before reviewing.
> 2. **Produce an Intent Summary** (see output format below) — a concise description of what the changes are trying to do, written so the author can confirm you understood correctly.
> 3. Read and follow `REVIEW_GUIDELINES.md` at the repository root before reviewing. Treat it as project-specific review guidance that supplements any other instructions.
> 4. Review against those guidelines and the output format below.
> 5. Produce the output in the specified format.
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
> - Group code findings by severity: 🔴 Must Fix, 🟡 Should Fix, 🔵 Nit.
> - Group feature/UX findings separately under 🟣 Feature/UX.
>
> ## Output Format
>
> Start with the Intent Summary, then list findings grouped by category. End with a verdict.
>
> ```
> ### 🎯 Intent Summary
>
> [2-4 sentences describing what you believe these changes are trying to accomplish, the feature being built or modified, and the user-facing behavior being introduced or changed. Write this so the author can confirm or correct your understanding.]
>
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
> ### 🟣 Feature/UX
>
> **[file:line or component/area] Short title**
> What: [what's missing, broken, or inconsistent from the user's perspective]
> Impact: [what the user will experience — confusion, dead end, broken flow, inaccessible action]
> Fix: [specific suggestion, referencing existing patterns in the codebase where relevant]
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
