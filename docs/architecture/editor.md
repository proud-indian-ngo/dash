# Editor (`packages/editor`)

> **Load when**: `@pi-dash/editor`, Plate.js, `PlateEditor`, `PlateRenderer`, editor image upload, rich text.
> **Related**: `file-uploads.md`

Plate.js rich text with two entry points: `@pi-dash/editor/editor` (`PlateEditor`, full plugin set) and `@pi-dash/editor/renderer` (`PlateRenderer`, read-only subset for stored Plate JSON).

- The package validates image files itself, but transport belongs to the caller through `onImageUpload`.
- The web adapters in `apps/web/src/components/editor/` supply the upload through a presigned URL. `entityId` lives in the adapter, not the package.
- Consumers lazy-load the adapters with `React.lazy`; `editor-skeletons.tsx` holds the fallbacks.
