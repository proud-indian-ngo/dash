# File Uploads

> **Load when**: R2, Cloudflare R2, presigned URL, attachments, Immich, event photos, `immichAssetId`, photo album, S3 presign.
> **Related**: `jobs.md`, `notifications.md`

## Cloudflare R2 (Attachments)

1. Client requests presigned URL via `getPresignedUploadUrl` server fn.
2. Client uploads directly to R2 via presigned PUT.
3. Object key stored in DB (attachment record).
4. Download proxied through `/api/attachments/download`.

R2 subfolders: `attachments`, `avatars`, `photos`, `updates`.

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
