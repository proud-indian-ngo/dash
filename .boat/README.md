# PR evidence for pi-dash

Every PR carries evidence from `boat-kit verify --pr <n>` in its description (boat-kit's README, in the agent-config repository, covers the tool). Push first: the sandboxes check the commit out from origin.

- **Tests.** The E2E specs the branch adds or changes run on the head, recorded, on the production server. Name others as arguments, with Playwright flags: `boat-kit verify --pr 12 tests/roles/admin-flows.spec.ts --project=admin`.
- **Screens.** For a visible change, pass `--scenario <file>`: the screens to capture, on desktop and phone, in two sandboxes at once, one on the merge base and one on the head. Both have the snapshot's seeded data.

## The scenario

A TypeScript module that default-exports the screens. Keep it out of the repository.

```ts
export default [
  { as: "admin", name: "teams", path: "/teams" },
  {
    as: "admin",
    name: "new-vendor-dialog",
    path: "/vendors",
    viewports: ["desktop"],
    prepare: async (page) => {
      await page.getByRole("button", { name: "Add vendor" }).click();
      await page.getByRole("dialog").waitFor();
    },
  },
  { as: "volunteer", name: "home", path: "/", viewports: ["phone"] },
  { as: "admin", name: "budget-report", path: "/finance/budget-report", before: false },
];
```

- `as` signs in as a seeded role: `super_admin`, `admin`, `finance_admin`, `volunteer` or `unoriented_volunteer`. Leave it out for a signed-out page.
- `viewports` is `desktop` (1440 by 900), `phone` (iPhone 13) or both, the default.
- `before: false` marks a screen the branch adds, so the merge base skips it.
- `prepare` reaches the state to show after the page settles: opens a dialog, fills a form, or creates data the seed lacks. Captures wait for Zero and for spinners and skeletons to go, and hide the dev overlays.
- `fullPage: true` captures the whole page; phone bars then land mid-image, and a pair of different heights won't line up.

A screen that fails shows its error in the evidence; on the merge base that usually means the screen is new.
