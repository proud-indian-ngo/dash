# Event Updates & Photos Design

## Overview

Add post-event updates (rich text) and photo gallery (via Immich) to events. Lock down cancel/interest once event starts.

## Database Schema

### `eventUpdate`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `eventId` | UUID FK -> teamEvent | cascade delete |
| `content` | text | Tiptap JSON (rich text) |
| `createdBy` | text FK -> user | |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

### `eventPhoto`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `eventId` | UUID FK -> teamEvent | cascade delete |
| `r2Key` | text | R2 staging key |
| `immichAssetId` | text, nullable | Set after Immich upload on approval |
| `caption` | text, nullable | |
| `status` | enum: pending, approved, rejected | default pending |
| `uploadedBy` | text FK -> user | |
| `reviewedBy` | text FK -> user, nullable | |
| `reviewedAt` | timestamp, nullable | |
| `createdAt` | timestamp | |

### `eventImmichAlbum`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `eventId` | UUID FK -> teamEvent | unique, cascade delete |
| `immichAlbumId` | text | Immich album UUID |
| `createdAt` | timestamp | |

## Env Vars

- `IMMICH_SERVER_URL` — Immich server base URL
- `IMMICH_API_KEY` — Server API key with album/asset permissions

## Immich Integration

Server functions at `apps/web/src/functions/immich.ts`:
- `createAlbum(eventName)` -> creates album, returns albumId
- `uploadAssetToAlbum(albumId, r2Key)` -> downloads from R2, uploads to Immich, adds to album, returns assetId
- `deleteAsset(assetId)` -> cleanup

### Flow

1. Any user uploads photo -> presigned R2 URL, creates `eventPhoto` row
2. Admin/lead uploads -> auto-approved, triggers Immich flow immediately
3. Admin/lead approves participant photo -> triggers Immich flow
4. Immich flow: ensure `eventImmichAlbum` exists -> upload from R2 to Immich -> store `immichAssetId`
5. Rejection -> delete R2 file, mark rejected

Immich calls happen in Zero mutator async tasks.

## Mutators

### Event Update

- **`eventUpdate.create`** — admin/lead only, requires `now >= startTime`
- **`eventUpdate.update`** — admin or original author
- **`eventUpdate.delete`** — admin or original author

### Event Photo

- **`eventPhoto.upload`** — admin/lead/event member, requires `now >= startTime`. Admin/lead auto-approved, participant -> pending.
- **`eventPhoto.approve`** — admin/lead, triggers Immich flow
- **`eventPhoto.reject`** — admin/lead, deletes R2 file
- **`eventPhoto.delete`** — admin/lead, deletes from Immich + R2

### Existing Mutator Changes

- **`teamEvent.cancel`** — reject if `now >= startTime`
- **`eventInterest.create`** — reject if `now >= startTime`

## Zero Queries

- **`eventUpdate.byEvent({ eventId })`** — all updates, ordered by createdAt desc
- **`eventPhoto.byEvent({ eventId })`** — admin/lead see all, others see approved only
- **`eventPhoto.pendingByEvent({ eventId })`** — pending photos for approval UI
- **`eventImmichAlbum.byEvent({ eventId })`** — album record for Immich link

## UI

### Tiptap Editor Component

`apps/web/src/components/editor/tiptap-editor.tsx` — StarterKit + Link + Image extensions. Images uploaded via R2 presigned URLs. Stores/renders Tiptap JSON.

### Event Detail Page (`$id.tsx`)

Two new tabs visible once `now >= startTime`:

**Updates tab**: reverse-chronological list of updates rendered from Tiptap JSON. Admin/lead see "Post Update" button with inline editor. Author sees edit/delete actions.

**Photos tab**: grid of approved photo thumbnails. Link to Immich album when it exists. Admin/lead see upload button + pending section with approve/reject. Event members see upload button (pending workflow).

### Existing UI Changes

- Hide "Cancel Event" button when `now >= startTime`
- Hide "Show Interest" button/dialog when `now >= startTime`
- Past events with updates/photos show indicator in events table

## Visibility

Event updates and photos are publicly visible (same as public event details) — serves as a public recap.
