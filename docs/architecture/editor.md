# Editor (`packages/editor`)

> **Load when**: `@pi-dash/editor`, Plate.js, `PlateEditor`, `PlateRenderer`, `onImageUpload`, editor image upload, rich text.
> **Related**: `file-uploads.md`

Plate.js (Slate-based) rich text with two entry points:

| Export | Component | Plugins |
|---|---|---|
| `@pi-dash/editor/editor` | `PlateEditor` | Full set in `src/editor.tsx`: toolbar, image upload, mentions |
| `@pi-dash/editor/renderer` | `PlateRenderer` | Read-only subset in `src/renderer.tsx` for stored Plate JSON |

- The package takes `onImageUpload: (file: File) => Promise<{ url: string } | undefined>` and validates files itself against `ALLOWED_IMAGE_TYPES` (`@pi-dash/shared/constants`). Transport belongs to the caller.
- The web adapters `apps/web/src/components/editor/plate-editor.tsx` and `plate-renderer.tsx` supply the upload through a presigned URL (`getEventEditorUploadUrl`). `entityId` lives in the adapter, not the package.
- Consumers lazy-load the adapters with `React.lazy(() => import("@/components/editor/plate-editor"))`; `editor-skeletons.tsx` holds the fallbacks.
