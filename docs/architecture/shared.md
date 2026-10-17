# Shared (`packages/shared`)

> **Load when**: `@pi-dash/shared`, client/server constant boundary, money helpers, upload limits, reminder presets, RRULE expansion, volunteer age.
> **Related**: `data-layer.md`, `editor.md`

Constants, types and pure functions used by both client and server. Each file is imported by path, `@pi-dash/shared/<file>`; there is no barrel. Money rules are in `data-layer.md`; domain modules are covered in the owning chapters.

Client code imports from `@pi-dash/shared`, never `@pi-dash/db/schema/shared`, which pulls server-only dependencies into the bundle.
