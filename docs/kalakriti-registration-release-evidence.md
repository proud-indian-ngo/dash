# Kalakriti Registration Release Evidence

This matrix is the release traceability record for KRR-001 through KRR-019. A row is complete only when its acceptance criteria have the named automated evidence or an explicit deferred check for behavior that does not exist in the Registration Release.

## Acceptance evidence

| Task | Authoritative implementation | Automated evidence |
| --- | --- | --- |
| KRR-001 | `packages/shared/src/kalakriti.ts`, `packages/db/src/schema/kalakriti.ts`, migrations `0050` through `0059`, and generated Zero schema | Shared constant tests plus database constraints exercised by Kalakriti mutator and E2E suites; `db:generate` and `zero:generate` must produce no unexplained diff. |
| KRR-002 | `packages/db/src/permissions.ts`, Edition access resolvers, scoped Zero queries, and assignment mutators | `kalakriti-edition-access.test.ts`, assignment mutator tests, and `registration-release-authorization.spec.ts` cover missing, archived, wrong-scope, and global-admin access. |
| KRR-003 | Edition mutator, linked-event guard, and the `/api/zero/mutate` transaction boundary | `kalakriti-edition.test.ts`, `team-event.test.ts`, and `edition-creation.spec.ts` cover synchronization, protected event commands, ordinary events, and both transaction rollback directions. |
| KRR-004 | Assignment and membership mutators plus linked `teamEventMember` synchronization | Assignment unit tests and `volunteer-assignment.spec.ts` cover explicit access, multiple assignments, final-assignment removal, and direct-roster protection. |
| KRR-005 | Guardian server functions, external identity policy, Better Auth blocking, and central picker filters | Guardian policy/function tests, `guardian-invite.spec.ts`, `guardian-lifecycle-concurrency.spec.ts`, and authorization E2E cover invite, exact-email reuse, concurrency, dormancy, sign-in, and central-directory exclusion. |
| KRR-006 | `/kalakriti` and `/kalakriti/:year` guards, Edition context, and gated navigation | Edition route tests and `registration-release-authorization.spec.ts` cover exact-year resolution, direct URLs, Guardian landing, unrelated volunteers, and absence of later-phase surfaces. |
| KRR-007 | Center commands, Guardian Center links, Liaison assignments, and independent registration flags | Center mutator tests and `center-registration-controls.spec.ts` cover scope, independent controls, bulk lock, audited reopen, stale writes, and protected deletion. |
| KRR-008 | Age Category derivation, configuration commands, quotas, and database scope constraints | Shared eligibility tests, eligibility mutator tests, `eligibility-configuration.spec.ts`, and race E2E cover boundaries, gaps, overlap, cross-Edition references, and quota serialization. |
| KRR-009 | Competition, Category, Venue, and Session commands plus schedule validation | Competition mutator tests and `competition-configuration.spec.ts` cover role authority, group rules, capacity, overlap, retirement, cancellation, and protected deletion. |
| KRR-010 | Readiness projection, lifecycle transition, registration guards, structural locks, and clone command | Edition/readiness tests and `lifecycle-readiness.spec.ts` cover blockers, confirmation, stale-client rejection, Center controls after reopen, schedule safety, and clone exclusions. |
| KRR-011 | Student command, immutable `humanId`, independent Credential rows, quota locks, and scoped UI | Student mutator tests, `student-registration.spec.ts`, and race E2E cover automatic IDs, eligibility, duplicate confirmation, quotas, invalidating edits, deletion, and Center scope. |
| KRR-012 | Individual Entry command and Entry/Member constraints | Entry mutator tests and `competition-entry-registration.spec.ts` cover eligibility, limits, overlap, locks, capacity, and cross-Edition or cross-Center rejection. |
| KRR-013 | Group Entry creation and atomic member replacement | Entry mutator tests and `competition-entry-registration.spec.ts` cover same-Center membership, per-member validation, one capacity unit, uniqueness, concurrency, and failed-update rollback. |
| KRR-014 | Public schedule query, API, and route allowlist | Public query tests and `public-schedule.spec.ts` cover draft and unknown 404s, allowed lifecycles, cancellation, live updates, and exact private-field exclusion. |
| KRR-015 | Lifecycle and schedule jobs, scoped recipient resolvers, notification preferences, inbox keys, and WhatsApp delivery keys | Jobs and notification unit tests cover active Guardians plus assigned volunteers, schedule scope, all lifecycle transitions, stale reminders, preferences, retry stability, inbox deduplication, and bounded channel keys. |
| KRR-016 | Audit policy, server projection, API, and paginated UI | Audit policy/server tests and authorization E2E cover stable snapshots, Edition and Lead scope, archived access, actor/target/reason/time, and metadata allowlisting. |
| KRR-017 | Server-side registration scope policy and aggregate dashboard projections | Dashboard tests and `release-database-races.spec.ts` compare authoritative post-race totals with Edition, Center, Category, and Competition projections. |
| KRR-018 | Server-authorized export route, allowlisted ZIP/CSV builders, and formula neutralization | Scope-policy, export, and CSV tests plus authorization and race E2E cover scope tampering, privacy, formula prefixes, and dashboard/export parity. |
| KRR-019 | Deterministic actors and release fixtures, private/public route registries, README, project structure, and architecture chapters | The complete Kalakriti Playwright suite covers the release journey, direct authorization, privacy, concurrency, dormancy, and later-surface absence; the repository gate below closes the branch. |

## Deferred acceptance checks

These checks belong to later Kalakriti releases and do not justify adding dormant production commands to the Registration Release:

- KRR-007: no transport command, route, or query exists in this release. The release-surface test proves that absence. When Center transport commands are introduced, their authorization tests must allow assigned Liaisons and reject Guardians with the same Center scope.
- KRR-011: Credential reissue is not exposed in this release. `kalakritiStudent.humanId` is stored independently from Credential rows and is immutable in Student updates. A future reissue test must revoke the prior Credential, copy the existing Student human ID to the replacement, and prove that manual lookup is unchanged.
- KRR-011 and KRR-012: transport, attendance, Result, prize, and other operational dependencies have no tables or commands in this release. Each later module must add its dependency check to Student and Entry deletion before exposing the new write surface.

## Release gate

Run the following against the final stacked branch and retain the command output in the final PR closeout:

```bash
bun run db:generate
bun run zero:generate
bun run check:types
bun run test:unit
bun run check
bun run check:unused
bun run test:e2e
```

The release is blocked by any generated-file drift, unexplained worktree diff, failing check, cross-scope access, public data leak, dormant Guardian session, exposed later-phase surface, or acceptance row without the evidence named above.
