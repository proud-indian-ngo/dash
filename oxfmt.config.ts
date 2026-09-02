import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...ultracite.ignorePatterns,
    ".agents/**",
    ".claude/**",
    ".worktrees/**",
    "**/*.md",
    "apps/web/src/routeTree.gen.ts",
    "packages/db/src/migrations/**",
    "packages/design-system/components/**",
    "packages/design-system/hooks/use-mobile.ts",
    "packages/design-system/lib/utils.ts",
    "packages/design-system/styles.css",
    "packages/editor/components/**",
    "packages/zero/src/schema.ts",
  ],
});
