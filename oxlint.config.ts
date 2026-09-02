import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  env: {
    browser: true,
    builtin: true,
    node: true,
  },
  ignorePatterns: [
    ...core.ignorePatterns,
    ".agents/**",
    ".claude/**",
    ".worktrees/**",
    "apps/web/src/routeTree.gen.ts",
    "packages/db/src/migrations/**",
    "packages/design-system/components/**",
    "packages/design-system/hooks/use-mobile.ts",
    "packages/design-system/lib/utils.ts",
    "packages/editor/components/**",
    "packages/zero/src/schema.ts",
  ],
  plugins: ["typescript", "unicorn", "oxc", "react", "jsx-a11y"],
  categories: {
    correctness: "error",
  },
  rules: {
    "jsx-a11y/control-has-associated-label": "off",
    "jsx-a11y/no-autofocus": "off",
    "jsx-a11y/prefer-tag-over-role": "off",
    "react-hooks/exhaustive-deps": "off",
    "react/immutability": "off",
    "react/purity": "off",
    "react/refs": "off",
    "react/set-state-in-effect": "off",
    "react/use-memo": "off",
    "unicorn/no-new-array": "off",
    "unicorn/no-thenable": "off",
    "unicorn/no-useless-spread": "off",
  },
});
