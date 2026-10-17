# Audit ledger

An immutable record of who changed what. Each authenticated, state-changing command writes one `audit_log` row.

| Piece | Where |
|---|---|
| Table, outcomes, metadata type | `packages/db/src/schema/audit-log.ts` |
| Runner, sanitising, Zero summaries | `apps/web/src/lib/audit.ts` |
| Zero mutation boundary | `apps/web/src/routes/api/zero/mutate.ts` (`runZeroAuditedMutation`) |
| Coverage test | `apps/web/src/lib/audit-entrypoint-coverage.test.ts` |
| Viewer and API | `apps/web/src/routes/_app/audit-log.tsx`, `apps/web/src/routes/api/audit-log.ts` |
| Kalakriti audit (Edition-scoped reads) | `apps/web/src/lib/kalakriti-audit-policy.ts`, `routes/_app/kalakriti/$year/audit.tsx` |

## What gets audited

- **Zero mutations:** every one, automatically. `mutate.ts` wraps each mutator and inserts the row in the same transaction. `summarizeZeroMutation` picks the action ID, target and metadata.
- **Server functions:** wrap the body in `runSessionAuditedAction`.
  - Every `POST` server function must be listed in the coverage test, as audited or exempt. An unlisted one fails `bun run test:unit`.
  - Audited ones must call `runSessionAuditedAction` inside the export.
- **API routes:** every `POST` route is classified in the same test. Authenticated ones (auth, jobs) use `runSessionAuditedAction`. The Social API's `posted` uses `runAuditedAction`.
- **Not audited:** reads, navigation, presigned-upload URLs, unauthenticated auth flows, signed webhooks, scheduled jobs, and the background effects a command triggers.
- **Audited even though they read:** revealing an encrypted identifier (`party.identifier.reveal`) or a vendor's bank account. Also the CA workbook and donations return exports, because they carry sensitive data. The financial-year export (`/api/financial-export`) is not audited.

## Row lifecycle

1. The runner inserts a `pending` row before the action runs. If that insert fails, the action does not run.
2. After the action, the row is finalized once, as `success`, `denied` or `failure`, with retries.
3. If finalizing fails after a success, the caller gets `AuditFinalizationError`; the action itself has completed.

A finalized row has no update or delete path.

## Metadata

Allowed:
- stable action IDs
- sanitized entity IDs (`sanitizeAuditTarget`, at most `MAX_ID_VALUES`)
- changed field names
- bounded counts

Forbidden:
- payloads and free text
- secrets
- contact details
- file data, URLs and object keys
- IP address and user-agent
- error messages

## Access

`audit_log.view` is enforced twice, independently: in the page's `beforeLoad` and in `/api/audit-log`. Kalakriti audit entries belong to an Edition, and reads apply its Edition and responsibility scopes.
