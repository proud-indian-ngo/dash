declare const __BUILD_ID__: string | undefined;

/**
 * The running build, set by `define` in `vite.config.ts` and served by
 * `/api/version` so open tabs can notice a deploy. Server-only: importing it
 * into client code would rename most chunks on every deploy (see
 * `lib/new-version.ts`). "dev" outside production builds and in unit tests.
 */
export const BUILD_ID =
  typeof __BUILD_ID__ === "undefined" ? "dev" : __BUILD_ID__;
