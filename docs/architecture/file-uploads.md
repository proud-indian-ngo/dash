# File Uploads

> **Load when**: R2, Cloudflare R2, presigned URL, attachments, Immich, event photos, `immichAssetId`, photo album, `getR2Client`, `ensureImmichAlbum`, `eventImmichAlbum`, payment screenshots, Kalakriti music or scorecards.
> **Related**: `jobs.md`, `notifications.md`, `env-and-secrets.md`

## R2 attachments

Every upload surface has its own signer in `apps/web/src/functions/attachments.ts`. There is no generic signer and no generic delete endpoint for persisted objects.

### Upload and claim

1. The client asks the surface's signer for a presigned PUT. Protected signers issue keys under `<R2_KEY_PREFIX>/<surface>/tmp/<userId>/`; callers cannot choose a parent ID or subfolder.
2. The client uploads directly to R2.
3. The owning Zero mutator checks the key sits under the current user's exact temp prefix and computes a deterministic, parent-scoped durable key.
4. Before the transaction commits, the server checks the stored MIME type and size, streams the exact bytes through a bounded writer and copies the object to the durable key (idempotent). A zero-length, changed or oversized stream fails the copy, rolls back the transaction and keeps the temp object for retry. Attempted durable targets are queued for delayed, reference-checked cleanup on rollback.
5. The transaction holds a shared advisory lock on the temp source and an exclusive one on the durable target through commit.
6. After commit, temp-source deletion is enqueued under an exclusive lock on the source key. Browser-triggered temp cleanup (`deleteTemporaryUpload`) takes the same lock.

### Deletion

- Replaced or deleted durable objects are deleted after 30 seconds by a job that holds an exclusive lock, rechecks every database reference and deletes only an unreferenced key.
- Every delete job must name its mode, `temporary-source` or `if-unreferenced`; omitting it is a type error.
- Reference checks also recognise two historical layouts, `scheduled-messages/scheduled-message-draft/` and invoice attachments under `attachments/<dialogUuid>/`, and retained rows such as Kalakriti music and replaced scorecards.

### Temp prefixes and lifecycle rules

Protected temp subfolders: `attachments`, `approval-screenshots`, `kalakriti-inventory`, `kalakriti-music`, `kalakriti-scorecards`, `photos`, `scheduled-messages`.

Each `<R2_KEY_PREFIX>/<subfolder>/tmp/` prefix needs a 24-hour expiry rule in Cloudflare. The repository does not manage the bucket, so apply the rules there. They only catch abandoned uploads; successful claims delete the source right after commit.

Avatars (`avatars`) and editor images (`updates`) have dedicated durable signers with no temp stage.

### Reads

Browser reads use typed asset references, never a caller-supplied key. A raw object key never authorises a read, even for durable keys that predate the current `R2_KEY_PREFIX`, and keys with a `tmp/` segment are never readable. During the private-storage rollout the bucket stays publicly reachable only for families not yet migrated; legacy CDN URLs still resolve.

| Route | Authorises |
|---|---|
| `/api/attachments/download?id=&kind=` | Owner or `requests.view_all` against the exact row; streams from R2. Scheduled-message references also carry the persisted key, since those attachments live in JSON |
| `/api/media/event-photo/<photoId>` | Event visibility, membership, uploader, lead or event management; redirects to a 2-minute signed URL |
| `/api/media/avatar/<userId>?key=` | Any signed-in user, when the key matches that user's `user.image`; 2-minute signed URL |
| `/api/media/event-update?eventId=&key=` | Event visibility plus access to the owning row: approved updates follow the event, pending updates are author, approver or lead only, feedback is submitter, feedback manager or lead only; 2-minute signed URL |
| `/api/immich/thumbnail.$id`, `/api/immich/original.$id` | Proxies Immich with the API key server-side |

Scheduled WhatsApp delivery signs persisted attachment keys for 15 minutes when the job runs. Notification payloads never include approval screenshots.

In development, the Vite `/api/` middleware (`apps/web/src/lib/dev/api-media-dev-middleware.ts`) normalises image, audio and video `Sec-Fetch-Dest` headers. Without it Nitro treats native media requests as static assets and returns 404.

## Surfaces

### Avatars and editor images

- Avatar: owner only, shared image MIME list, 5 MB. Stores `/api/media/avatar/<userId>?key=<key>` in `user.image`.
- Plate editor image: `event_updates.create` or lead of the event's team, shared image MIME list, 20 MB. Stores `/api/media/event-update?eventId=<id>&key=<key>` in the content.

### Payment screenshots

Approving a reimbursement or advance payment requires a payment screenshot, because approval means the claimant has been paid and the screenshot is the evidence.

- `approve` refuses unless the call carries a new upload or the record already has one. A new key must be under the approver's own `approval-screenshots/tmp/<userId>/` folder and pass the screenshot type and size limits. A temp key that no longer exists is refused even if its durable target does.
- Rejecting keeps the screenshot; a later re-approval can reuse it, and the dialog shows it as attached with an optional Replace.
- Reimbursements never lose a screenshot while the claim exists. A replacement keeps the old file as an attachment named `payment-proof-replaced-<day>.<ext>` (India day, `-2` and on for clashes); resetting to pending keeps it as `payment-proof-previous-<day>.<ext>`. Only approvers can remove these ("Only an approver can remove kept payment proof"), which queues an `if-unreferenced` delete.
- Advance payments still delete a replaced or reset screenshot.
- `reimbursement.addPaymentProof` lets an approver add proof to a request approved before the rule, through the same claim path. See "Payment proof after approval" in `finance-books.md`.

### Vendor-payment invoices

The signer takes the payment ID only to authorise the payment owner or a holder of `requests.approve` or `requests.edit_all`. The key stays under the current user's `attachments/tmp/`.

### Kalakriti Entry music

- `getKalakritiEntryMusicUploadUrl`: `audio/mpeg`, `audio/mp4`, `audio/aac`, `audio/x-m4a`, 20 MB each. Do not add these to `ALLOWED_MIME_TYPES`.
- Center and Division IDs authorise the upload but never appear in the temp key. New entries need open registration. With an `entryId`, the signer checks its Edition, Center and Division and allows scoped changes after registration closes, but not in archived Editions.
- The music modal stages up to two optional files and saves additions and removals in one transaction. Closing without saving cleans the temp uploads; a failed file can be retried alone.
- Durable keys: `kalakriti-music/<editionId>/<entryId>/...`. Each child music row owns one file. Downloads use `{ id: musicFileId, kind: "kalakritiEntryMusic" }` with live registration-scope checks.
- Playback uses inline disposition and Download uses attachment. The proxy forwards byte ranges for seeking.

### Kalakriti inventory photos

One optional photo per item, shared image MIME list, 5 MB. The signer needs inventory write access in a non-archived Edition. Claims go to `kalakriti-inventory/<editionId>/<itemId>/...`; downloads use `{ id: itemId, kind: "kalakritiInventoryPhoto" }` against the item's current key.

### Kalakriti scorecards

`getKalakritiScorecardUploadUrl` takes an Edition and Division and needs scoped results authority in a Live, unfinalised Edition. PDF, JPEG or PNG, 20 MB, at most ten per result. Claims go to `kalakriti-scorecards/<editionId>/<divisionId>/...`. Downloads use `{ kind: "kalakritiScorecard", id }` and need current results-management scope; Edition or leaderboard access is not enough. Replaced scorecards stay referenced for revision history.

### Scheduled-message attachments

They stay referenced and downloadable after delivery. Replacing them or deleting the message retires the reference and enqueues cleanup.

## Immich event photos

Optional. Config: `IMMICH_API_KEY`, `VITE_IMMICH_URL`. `getImmichConfig()` (`apps/web/src/lib/immich.ts`) returns `null` when either is missing, and callers must then do nothing. Calls are plain `fetch()` with `x-api-key`; there is no SDK.

1. A member uploads a photo, stored as an `event_photo` with an R2 key.
2. Approval enqueues `immich-sync-photo` with `singletonKey: photoId`.
3. The job (`packages/jobs/src/handlers/immich-sync-photo.ts`), in this order for crash safety:
   1. finds or creates the event's album (`event_immich_album`)
   2. downloads from R2 and uploads to Immich
   3. stores `immichAssetId` at once, so a retry after a crash skips the re-upload
   4. adds the asset to the album
   5. clears `r2Key` and enqueues delayed, reference-checked R2 deletion
4. Deleting a photo enqueues `immich-delete-asset` and/or `delete-r2-object`.

Leads and holders of `events.manage_photos` can also upload photos and videos straight to Immich with `uploadPhotoToImmich` (`apps/web/src/functions/immich-upload.ts`), skipping R2 and approval.

The Social API serves approved photos through signed links and backfills size and capture time from Immich; `do_not_use` marks photos social posts must skip. See `social-api.md`.

## R2 client

`getR2Client()` (`packages/jobs/src/handlers/r2.ts`) builds Bun's native `S3Client` for `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, not the AWS SDK. Variables are listed in `env-and-secrets.md`.
