# File Uploads

> **Load when**: R2, Cloudflare R2, presigned URL, attachments, Immich, event photos, `immichAssetId`, photo album, S3 presign, `getR2Client`, `ensureImmichAlbum`, `eventImmichAlbum`, S3Client from bun.
> **Related**: `jobs.md`, `notifications.md`, `env-and-secrets.md`

## Cloudflare R2 (Attachments)

1. Client requests presigned URL via `getPresignedUploadUrl` server fn.
2. Client uploads directly to R2 via presigned PUT.
3. Object key stored in DB (attachment record).
4. Browser receives a typed asset reference, never a caller-provided object key.
5. Download is authorized against the exact persisted row and streamed through
   `/api/attachments/download`.

R2 subfolders: `attachments`, `avatars`, `photos`, `updates`.

During the private-storage rollout, the bucket remains publicly reachable only
for asset families that have not migrated yet. All migrated reads use an exact
persisted database reference; a raw object key is never authorization. Keys
containing a `tmp/` path segment are never readable.

Avatar and Plate editor uploads have dedicated signers:

- Avatar replacement is owner-only, accepts the shared image MIME list with a
  5 MB limit, and stores `/api/media/avatar/<userId>?key=<key>` in `user.image`.
- Editor image uploads require `event_updates.create` or lead membership in the
  event's team, accept the shared image MIME list with a 20 MB limit, and store
  `/api/media/event-update?eventId=<id>&key=<key>` in Plate content.
- The generic attachment signer does not accept the `updates` subfolder.

Legacy CDN URLs remain readable during rollout. Run the idempotent backfill in
dry-run mode first, review changed/skipped/malformed counts, then apply it:

```bash
bun run r2:migrate-media-urls -- --legacy-cdn-url=https://cdn.example.org
bun run r2:migrate-media-urls -- --legacy-cdn-url=https://cdn.example.org --apply
bun run r2:migrate-media-urls -- --legacy-cdn-url=https://cdn.example.org --apply --batch-size=250
```

The migration rewrites `user.image`, `event_update.content`, and
`event_feedback.content` in transactional batches of 100 rows by default;
`--batch-size` accepts 1 through 1000. Raw keys and legacy CDN URLs are
canonicalized, while unrelated external URLs are left unchanged. The
orphan-cleanup job recognizes raw keys, legacy CDN URLs, and canonical app URLs.

## Immich (Event Photos)

Optional integration for photo album management. Config: `IMMICH_API_KEY`, `VITE_IMMICH_URL`.

Flow:

1. Member uploads photo → stored as event photo record with R2 key.
2. Lead/admin approves → `immich-sync-photo` pg-boss job enqueued (with `singletonKey: photoId` → no dup processing).
3. Job: resolves/creates Immich album for event → downloads from R2 → uploads to Immich → persists `immichAssetId` immediately → adds to album → clears R2 key → deletes R2 object (best-effort).
4. Photo deletion enqueues `immich-delete-asset` and/or `delete-r2-object` jobs as needed.
5. Thumbnails/originals proxied through `/api/immich/thumbnail.$id` and `/api/immich/original.$id`.

Implementation:
- Mutator: `packages/zero/src/mutators/event-photo.ts`
- Handlers: `packages/jobs/src/handlers/immich-sync-photo.ts`, `immich-delete-asset.ts`, `delete-r2-object.ts`
- Shared R2 client: `packages/jobs/src/handlers/r2.ts`

## R2 Client

`getR2Client()` in `packages/jobs/src/handlers/r2.ts`. Uses **Bun's native `S3Client`** (not AWS SDK) — smaller, no Node polyfills.

```ts
new S3Client({
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: R2_ACCESS_KEY,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  bucket: R2_BUCKET_NAME,
});
```

Env vars in `env-and-secrets.md`. Single client shared across handlers — don't instantiate per-call.

## Immich Client

`apps/web/src/lib/immich.ts`. Plain `fetch()` calls to `VITE_IMMICH_URL/api/*` with `x-api-key: IMMICH_API_KEY`. No SDK.

- `getImmichConfig()` returns `null` if either env var missing → call sites must no-op gracefully.
- `ensureImmichAlbum(config, eventId, eventName)` — upsert pattern:
  1. Query `eventImmichAlbum` table for existing mapping.
  2. If present → return `immichAlbumId`.
  3. Else → `POST /api/albums` to Immich → insert row with `uuidv7()` PK.

## Upload Pipeline Ordering

Photo sync is **ordered** for crash safety:

1. Download from R2 to memory/stream.
2. Upload to Immich → receive `immichAssetId`.
3. **Persist `immichAssetId` in DB immediately** (before album-add + R2 delete). If worker crashes after this, next retry skips re-upload.
4. Add asset to Immich album via `PUT /api/albums/:id/assets`.
5. Clear R2 key from DB (`r2Key = null`).
6. Best-effort R2 delete via `delete-r2-object` job enqueue.

`singletonKey: photoId` on `immich-sync-photo` job → pg-boss dedups concurrent enqueues for the same photo.

## Asset Proxying

Protected R2 objects are never exposed directly to clients:
- Downloads: `/api/attachments/download?id=<rowId>&kind=<assetKind>` — resolves the exact database row, validates owner or `requests.view_all` access, and streams from R2. Scheduled-message references also include the exact persisted key because their attachments are stored in JSON.
- Event media: `/api/media/event-photo/<photoId>` — validates event visibility, membership, uploader, lead, or event-management access, then redirects to a two-minute signed GET URL.
- Avatars: `/api/media/avatar/<userId>?key=<key>` — requires a session, matches the key against that user's current `user.image`, then redirects to a two-minute signed GET URL. Any authenticated user may view a matched avatar.
- Event editor media: `/api/media/event-update?eventId=<id>&key=<key>` — requires normal event visibility, an exact image reference, and access to the owning content row. Approved updates follow event visibility; pending updates remain author/approver/lead-only; feedback remains submitter/feedback-manager/lead-only. Authorized reads redirect to a two-minute signed GET URL.
- Scheduled WhatsApp delivery signs persisted attachment keys for 15 minutes when the job executes. Notification payloads do not include protected approval screenshots.
- Immich thumbnails: `/api/immich/thumbnail.$id` + `/api/immich/original.$id` — proxies through the server with API key injected. Client never sees `IMMICH_API_KEY`.
