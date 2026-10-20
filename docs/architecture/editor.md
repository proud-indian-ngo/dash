# Editor (`packages/editor`)

> **Load when**: `@pi-dash/editor`, Plate.js, `PlateEditor`, `PlateRenderer`, `RichTextEditor`, editor image upload, rich text.
> **Related**: `file-uploads.md`

Plate.js rich text with two presets.

- **Full**: `@pi-dash/editor/editor` (`PlateEditor`, full plugin set, saved with its own button) and `@pi-dash/editor/renderer` (`PlateRenderer`, read-only view of stored Plate JSON). Event updates and feedback use it.
  - The renderer uses Plate's static rendering (`createStaticEditor` and `PlateStatic`) with the `*-base-kit.tsx` plugins and `*-node-static.tsx` components, so a feed of feedback or updates mounts no Slate editor per item. A node type the editor can produce needs a base kit and static component here too, or the renderer shows it as a plain block.
  - Keep static components visually in step with their editor twins. The static toggle keeps the editor's collapse behaviour by holding open toggle IDs in the static editor's plugin options, which is why the renderer passes `optionsStoreFactory: createZustandStore`.
  - The renderer does not normalise values. Blockquotes saved before Plate 53, which hold text directly rather than paragraphs, render as they always have.
- **Rich text**: `@pi-dash/editor/rich-text-editor` (`RichTextEditor`, a form field: `value` and `onChange`) and `@pi-dash/editor/rich-text-renderer` (`RichTextRenderer`), both on `RichTextKit`. Paragraphs, bold, italic, underline, lists and simple bordered tables with a header row; no resizing, merging or colours. The toolbar fits one row on a phone; inside a table it adds row and column actions. Its format and checks are `@pi-dash/shared/rich-text`, which the server applies to what the editor sends. Resolution text uses it ([resolutions](governance-resolutions.md#text)); the web wraps it as `RichTextField` and `RichText`.

- The package validates image files itself, but transport belongs to the caller through `onImageUpload`.
- The web adapters in `apps/web/src/components/editor/` supply the upload through a presigned URL. `entityId` lives in the adapter, not the package.
- Consumers lazy-load the adapters with `React.lazy`; `editor-skeletons.tsx` holds the fallbacks.
