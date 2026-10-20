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
  overrides: [
    {
      // Phones get bottom drawers through the shared wrappers.
      files: ["apps/web/src/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@pi-dash/design-system/components/ui/dialog",
                message:
                  "Use @/components/shared/responsive-dialog so phones get a drawer.",
              },
              {
                name: "@pi-dash/design-system/components/ui/alert-dialog",
                message:
                  "Use @/components/shared/responsive-alert-dialog so phones get a drawer.",
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        "apps/web/src/components/shared/responsive-dialog.tsx",
        "apps/web/src/components/shared/responsive-alert-dialog.tsx",
        // Phones get a full-height sheet: a drawer swipe would fight the pen.
        "apps/web/src/components/reimbursements/collect-payee-signature-dialog.tsx",
        // Phones get a full-screen viewer: a drawer swipe would fight scrolling pages.
        "apps/web/src/components/shared/file-preview.tsx",
      ],
      rules: { "no-restricted-imports": "off" },
    },
  ],
});
