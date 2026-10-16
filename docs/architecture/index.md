# Architecture Docs — Index

**Agents: read this first when any trigger below matches.** Then load the matching chapter(s) with `rtk read docs/architecture/<chapter>.md`. Do NOT load everything.

Chapters intentionally sharded so loading stays cheap.

## Chapter Map

| Chapter | File | Load when task mentions / touches |
|---|---|---|
| Monorepo | `monorepo.md` | new workspace, package layout, Turborepo, Dockerfile copy lines, build topology |
| Data Layer | `data-layer.md` | Zero, mutators, queries, Drizzle schema, connection pool, sync, SSR, preload, IndexedDB |
| Auth | `auth.md` | Better Auth, session cookie, sign-in, `getAuth`, `requireSession`, 5-min cache |
| Authorization | `authorization.md` | permissions, `assertHasPermission`, `can`, `hasPermission`, roles, `team_lead`, `volunteer`, `resolvePermissions` |
| Recurring Events | `recurring-events.md` | RRULE, `teamEvent`, `seriesId`, `originalDate`, materialize, exdate, expandSeries, edit/cancel scope |
| Vendor Payments | `vendor-payments.md` | vendor payment, VP, status state machine, invoice approval, `recalculateParentStatus`, `quotation`, `invoice` purposes |
| Notifications | `notifications.md` | `enqueue`, in-app inbox, email, WhatsApp RSVP poll, notification topic preferences, `notify-*` handlers, GoWA gateway |
| Social API | `social-api.md` | `/api/social/v1`, social-artifacts pipeline, bearer tokens, `social:token`, `event_partner`, `social_post`, signed photo links, social digest, post-event social fields |
| File Uploads | `file-uploads.md` | R2, presigned URL, attachments, Immich sync, event photos, `immichAssetId` |
| Cash Vouchers | `cash-vouchers.md` | cash voucher, cash-voucher limit, payee phone, PDF generation, `generate-cash-voucher`, `@react-pdf/renderer`, `VOUCHER_ORG_*` |
| Observability | `observability.md` | evlog, `createRequestLogger`, `withTaskLog`, `withFireAndForgetLog`, client logger, `/api/log/ingest` |
| Jobs | `jobs.md` | pg-boss, job handler, `enqueue`, schedules, retry, DLQ, `singletonKey`, 42 handlers |
| PDF | `pdf.md` | `@pi-dash/pdf`, voucher layout, `amount-to-words`, signature assets |
| Editor | `editor.md` | `@pi-dash/editor`, Plate.js, `PlateEditor`, `PlateRenderer`, `onImageUpload` adapter |
| Shared | `shared.md` | `@pi-dash/shared`, `ALLOWED_IMAGE_TYPES`, event reminder presets, client/server constant boundary |
| Env & Secrets | `env-and-secrets.md` | `packages/env`, `.env`, `.env.worktree`, `BETTER_AUTH_SECRET`, `createEnv`, worktree port auto-detect, `SKIP_VALIDATION`, `VITE_E2E` |
| Caching & Rate Limit | `caching.md` | `getCachedAuth`, `invalidateAuthCache`, permission cache TTL, `checkRateLimit`, 429 response, HMR-reset cache, `Retry-After` |
| E2E Testing | `e2e-testing.md` | `packages/e2e`, Playwright global setup, seed helpers, `.auth` state, `shard-by-duration`, `run-e2e.sh`, duration reporter |
| Design Language | `design-language.md` | visual design, brand, colours, fonts, Bricolage, Paper Mono, `@proudindian/design`, pi-design, `.pi-*` classes, StatusBadge/Tag, restyling, "make it look like the website" |
| Finance & Programmes (design) | `finance-and-programmes.md` | finance redesign, programme, project, fund, ledger entry, account head, contribution, donor, receipt, Form 113/114 (formerly 10BD/10BE), FC-4, FCRA, budget, approval policy, advance settlement, in-kind, retention class |
| Finance ledger cutover (Phase 0) | `finance-ledger-cutover.md` | ledger cutover, opening balances, audited FY 2025-26 figures, fixed deposit, backfill, posting rules in plain language, CA questions, CA handoff workbook |
| Governance (design) | `governance.md` | trustee register, Board of Trustees, office-bearers, circular resolution, board meeting, quorum, minutes, trust deed versions, DSC signing, HYP2003, pyHanko, signing helper, Aadhaar eSign, compliance calendar, conflict of interest, policy register, CSR utilisation certificate |
| Kalakriti Registration | `kalakriti-registration.md` | Kalakriti Edition access, Guardian identity, Center controls, eligibility, Competitions, Students, Entries, lifecycle, public schedule, dashboards, audit, scoped exports |

## Load Rules

- **Index first, chapter second**. Skip index only if prior turn already read it in this session.
- **Multiple chapters allowed**. Data-layer work often pulls `data-layer.md` + `authorization.md`.
- **Skip entirely for**: UI copy, lint fixes, dep bumps, typo fixes, test-only edits, commit message drafting, config-file edits unrelated to above triggers.
- If task scope unclear → skip architecture docs, start reading code first, reconsider only if code surfaces unfamiliar architectural patterns.

## Cross-Refs

- `project-structure.md` — file layout, paths, library doc IDs (kept separate, always-on repo map)
- `DEPLOYMENT.md` — env vars, hosting, build steps (load only for deploy/infra work)
- `README.md` — onboarding, scripts overview
