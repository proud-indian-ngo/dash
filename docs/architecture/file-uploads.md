# File Uploads

> **Load when**: R2, presigned URLs, attachments, Immich, event photos, payment screenshots, Kalakriti music or scorecards.
> **Related**: `jobs.md`, `notifications.md`, `env-and-secrets.md`

## R2 attachments

Every upload surface has its own signer in `apps/web/src/functions/attachments.ts`. There is no generic signer and no generic delete endpoint for persisted objects.

### Upload and claim

1. The surface's signer issues a presigned PUT under `<R2_KEY_PREFIX>/<surface>/tmp/<userId>/`. Callers cannot choose a parent ID or subfolder.
2. The client uploads directly to R2.
3. The owning Zero mutator checks the key sits under the current user's exact temp prefix and computes a deterministic, parent-scoped durable key.
4. Before commit, the server checks MIME type and size and copies the exact bytes to the durable key. A failed copy rolls back the transaction and keeps the temp object for retry.
5. Advisory locks on the temp source and durable target are held through commit.
6. After commit, temp-source deletion is enqueued under the same source lock that browser-triggered temp cleanup takes.

A presigned PUT can store more than the size it declared, so a server function that reads an upload into memory (governance signed copies and vault imports, through `readGovernanceUpload`) checks the stored size first and stops the read if the object grows.

### Deletion

- Replaced or deleted durable objects are deleted after a delay by a job that locks the key, rechecks every database reference and deletes only an unreferenced key.
- Every delete job must name its mode, `temporary-source` or `if-unreferenced`.
- Reference checks also recognise historical layouts and retained rows such as Kalakriti music and replaced scorecards.

### Temp prefixes and lifecycle rules

Each protected `<R2_KEY_PREFIX>/<subfolder>/tmp/` prefix (the `subfolder` values in `attachments.ts`) needs a 24-hour expiry rule in Cloudflare. The repository does not manage the bucket, so apply the rules there. They only catch abandoned uploads.

Avatars and editor images have dedicated durable signers with no temp stage.

### Reads

Browser reads use typed asset references, never a caller-supplied key. A raw object key never authorises a read, and keys with a `tmp/` segment are never readable. During the private-storage rollout the bucket stays publicly reachable only for families not yet migrated.

`/api/attachments/download`, `/api/media/*` and `/api/immich/*` check access against the owning row, then stream or redirect to a short-lived signed URL. Event-photo routes take the photo row ID; they never accept an R2 key or Immich asset ID from the caller. Immich proxies keep the API key server-side.

Scheduled WhatsApp delivery signs persisted attachment keys when the job runs. Notification payloads never include approval screenshots.

In development, the Vite `/api/` middleware (`apps/web/src/lib/dev/api-media-dev-middleware.ts`) normalises media `Sec-Fetch-Dest` headers. Without it Nitro treats native media requests as static assets and returns 404.

## Surfaces

### Payment screenshots

Approving a reimbursement or advance payment requires a payment screenshot, because approval means the claimant has been paid and the screenshot is the evidence.

- `approve` refuses unless the call carries a new upload or the record already has one. A temp key that no longer exists is refused even if its durable target does.
- Rejecting keeps the screenshot, so a later re-approval can reuse it.
- Reimbursements never lose a screenshot while the claim exists: a replaced or reset screenshot is kept as an attachment, and only approvers can remove it. Advance payments still delete it.
- `reimbursement.addPaymentProof` adds proof to a request approved before the rule. See `finance-books.md`.

### Vendor-payment invoices

The signer takes the payment ID only to authorise the user. The key stays under the current user's `attachments/tmp/`.

### Kalakriti Entry music

- Audio types have their own allow-list. Do not add them to `ALLOWED_MIME_TYPES`.
- Center and Division IDs authorise the upload but never appear in the temp key. With an `entryId`, scoped changes are allowed after registration closes, but not in archived Editions.
- Downloads apply live registration-scope checks. The proxy forwards byte ranges for seeking.

### Kalakriti scorecards

Uploads need scoped results authority in a Live, unfinalised Edition. Downloads need current results-management scope; Edition or leaderboard access is not enough. Replaced scorecards stay referenced for revision history.

### Scheduled-message attachments

They stay referenced and downloadable after delivery.

## Immich event photos

Optional. `getImmichConfig()` (`apps/web/src/lib/immich.ts`) returns `null` when unconfigured, and callers must then do nothing. Calls are plain `fetch()`; there is no SDK.

1. A member uploads a photo, stored as an `event_photo` with an R2 key.
2. Approval enqueues `immich-sync-photo`, keyed by photo.
3. The job stores `immichAssetId` straight after upload. Retries resume album association while `r2Key` remains, then clear it and enqueue reference-checked R2 deletion. A row deleted during upload instead queues asset cleanup.
4. Photo deletion locks and rereads the row so it queues cleanup for any concurrently stored asset ID. Immich deletion skips assets still referenced by another photo because Immich deduplicates uploads.

Leads and photo managers can upload straight to Immich. The server returns a ten-minute signed receipt bound to the asset, event, photo, user and MIME type. The mutator requires that receipt and rechecks current authority; bare asset IDs cannot create references.

The Immich reference check does not serialize external uploads. An identical upload awaiting its photo-row insert can still race with deletion; closing that gap needs a durable pending-asset claim spanning both systems. Abandoned direct uploads can also leave unreferenced assets.

The Social API serves approved photos through signed links; `do_not_use` marks photos social posts must skip. See `social-api.md`.

## R2 client

`getR2Client()` (`packages/jobs/src/handlers/r2.ts`) uses Bun's native `S3Client`, not the AWS SDK.
