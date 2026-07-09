# File Uploads

> **Load when**: R2, Cloudflare R2, presigned URL, attachments, Immich, event photos, `immichAssetId`, photo album, S3 presign, `getR2Client`, `ensureImmichAlbum`, `eventImmichAlbum`, S3Client from bun.
> **Related**: `jobs.md`, `notifications.md`, `env-and-secrets.md`

## Cloudflare R2 (Attachments)

1. Client requests presigned URL via the scoped server fn for that upload surface.
2. Client uploads directly to R2 via presigned PUT.
3. Zero mutator validates object-key ownership and stores the durable DB key.
4. Download proxied through `/api/attachments/download`.

Upload signers:
- `getPresignedUploadUrl`: temporary `attachments` and `approval-screenshots` uploads.
- `getEventPhotoUploadUrl`: event photo uploads after event access checks.
- `getEditorImageUploadUrl`: event update image uploads after event access checks.
- `getScheduledMessageUploadUrl`: scheduled message media uploads after `messages.schedule` checks.

R2 subfolders: `attachments`, `approval-screenshots`, `avatars`, `photos`, `scheduled-messages`, `updates`.

Request, vendor-payment, event-photo, and scheduled-message attachment uploads use temp keys first. Scheduled-message upload URLs always target `scheduled-messages/tmp/{userId}/`; event-photo upload URLs target `photos/tmp/{userId}/`. The client never chooses a durable parent path. Server mutators compute the durable parent-scoped key during the DB mutation. Attachment claims run a blocking post-commit task that moves the temp object to its durable key before the mutation response returns. Scheduled-message send jobs run only after those moves succeed, so immediate sends cannot reference a durable key before the object exists. R2 deletes for removed persisted attachments are queued post-commit via `delete-r2-object`, so failed mutations do not delete still-referenced objects.

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

R2 objects never exposed directly to clients:
- Downloads: `/api/attachments/download?id=<id>&kind=<kind>` — validates permission, streams from R2. Scheduled message downloads also require `key=<r2Key>`.
- Immich thumbnails: `/api/immich/thumbnail.$id` + `/api/immich/original.$id` — proxies through the server with API key injected. Client never sees `IMMICH_API_KEY`.
