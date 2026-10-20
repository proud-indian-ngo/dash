# Editor (`packages/editor`)

> **Load when**: `@pi-dash/editor`, Plate.js, `PlateEditor`, `PlateRenderer`, editor image upload, rich text.
> **Related**: `file-uploads.md`

Plate.js rich text with two entry points: `@pi-dash/editor/editor` (`PlateEditor`, full plugin set) and `@pi-dash/editor/renderer` (`PlateRenderer`, read-only view of stored Plate JSON).

- The renderer uses Plate's static rendering (`createStaticEditor` and `PlateStatic`) with the `*-base-kit.tsx` plugins and `*-node-static.tsx` components, so a feed of feedback or updates mounts no Slate editor per item. A node type the editor can produce needs a base kit and static component here too, or the renderer shows it as a plain block.
- Keep static components visually in step with their editor twins. The static toggle keeps the editor's collapse behaviour by holding open toggle IDs in the static editor's plugin options, which is why the renderer passes `optionsStoreFactory: createZustandStore`.
- The renderer does not normalise values. Blockquotes saved before Plate 53, which hold text directly rather than paragraphs, render as they always have.

- The package validates image files itself, but transport belongs to the caller through `onImageUpload`.
- The web adapters in `apps/web/src/components/editor/` supply the upload through a presigned URL. `entityId` lives in the adapter, not the package.
- Consumers lazy-load the adapters with `React.lazy`; `editor-skeletons.tsx` holds the fallbacks.
