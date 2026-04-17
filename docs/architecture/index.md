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
| Notifications | `notifications.md` | `enqueue`, in-app inbox, email, WhatsApp RSVP poll, notification topic preferences, `notify-*` handlers, webhook proxy |
| File Uploads | `file-uploads.md` | R2, presigned URL, attachments, Immich sync, event photos, `immichAssetId` |
| Cash Vouchers | `cash-vouchers.md` | cash voucher, PDF generation, `generate-cash-voucher`, `@react-pdf/renderer`, `VOUCHER_ORG_*` |
| Observability | `observability.md` | evlog, `createRequestLogger`, `withTaskLog`, `withFireAndForgetLog`, client logger, `/api/log/ingest` |
| Jobs | `jobs.md` | pg-boss, job handler, `enqueue`, schedules, retry, DLQ, `singletonKey`, 42 handlers |
| PDF | `pdf.md` | `@pi-dash/pdf`, voucher layout, `amount-to-words`, signature assets |
| Editor | `editor.md` | `@pi-dash/editor`, Plate.js, `PlateEditor`, `PlateRenderer`, `onImageUpload` adapter |
| Shared | `shared.md` | `@pi-dash/shared`, `ALLOWED_IMAGE_TYPES`, event reminder presets, client/server constant boundary |
| Env & Secrets | `env-and-secrets.md` | `packages/env`, `.env`, `.env.worktree`, `BETTER_AUTH_SECRET`, `createEnv`, worktree port auto-detect, `SKIP_VALIDATION`, `VITE_E2E` |
| Caching & Rate Limit | `caching.md` | `getCachedAuth`, `invalidateAuthCache`, permission cache TTL, `checkRateLimit`, 429 response, HMR-reset cache, `Retry-After` |
| E2E Testing | `e2e-testing.md` | `packages/e2e`, Playwright global setup, seed helpers, `.auth` state, `shard-by-duration`, `run-e2e.sh`, duration reporter |

## Load Rules

- **Index first, chapter second**. Skip index only if prior turn already read it in this session.
- **Multiple chapters allowed**. Data-layer work often pulls `data-layer.md` + `authorization.md`.
- **Skip entirely for**: UI copy, CSS, lint fixes, dep bumps, typo fixes, test-only edits, commit message drafting, config-file edits unrelated to above triggers.
- If task scope unclear → skip architecture docs, start reading code first, reconsider only if code surfaces unfamiliar architectural patterns.

## Cross-Refs

- `project-structure.md` — file layout, paths, library doc IDs (kept separate, always-on repo map)
- `DEPLOYMENT.md` — env vars, hosting, build steps (load only for deploy/infra work)
- `README.md` — onboarding, scripts overview
