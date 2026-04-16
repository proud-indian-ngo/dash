# Editor (`packages/editor`)

> **Load when**: `@pi-dash/editor`, Plate.js, `PlateEditor`, `PlateRenderer`, `onImageUpload`, S3 presign upload, rich-text editor integration.
> **Related**: `file-uploads.md`

Rich-text editor — Plate.js (Slate-based). Two entry points:

| Export | Component | Use |
|---|---|---|
| `@pi-dash/editor/editor` | `PlateEditor` | Full editor — toolbar, image upload, mentions |
| `@pi-dash/editor/renderer` | `PlateRenderer` | Read-only renderer for Plate JSON content |

## Layout

- Plugin composition: `packages/editor/src/editor.tsx` (full set), `packages/editor/src/renderer.tsx` (minimal read-only subset).
- Image upload: `onImageUpload: (file: File) => Promise<{ url: string } | undefined>`. Validation inside editor. Adapter handles transport.
- Image MIME types: `ALLOWED_IMAGE_TYPES` from `packages/shared/src/constants.ts`.
- Web adapter: `apps/web/src/components/editor/plate-editor.tsx` wraps with S3 presign. `entityId` lives in the adapter, **not** the editor package.
- Lazy-load in consumers: `React.lazy(() => import("@pi-dash/editor/editor"))`.
