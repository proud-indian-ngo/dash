/**
 * The map select-tests.ts uses to choose the E2E specs a change can affect.
 * Each area is a folder under tests/; a spec belongs to its folder's area and
 * to any area its first line names, as in `// @e2e-areas finance income`.
 *
 * An area covers:
 * - `app`: a name under apps/web/src/routes/_app (folder or `.tsx`),
 *   apps/web/src/routes/api (folder or `.ts`) or apps/web/src/components.
 * - `named`: a glob for one path segment (a folder or file name) below
 *   packages/<package>/src, apps/web/src/functions, apps/web/src/lib or
 *   apps/web/src/hooks. Registries import those files, so the import graph
 *   would make each one look global; their names say which area they serve.
 * - `globs`: any other repository paths.
 *
 * A file no rule matches resolves through the reverse import graph to the
 * areas of the files that import it. `bun run check:e2e-map` fails on a
 * glob, name or area that matches nothing. See docs/architecture/e2e-testing.md.
 */

interface Area {
  app?: string[];
  named?: string[];
  globs?: string[];
}

export const areas = {
  analytics: { app: ["analytics"], named: ["outcomes*"] },
  audit: { app: ["audit", "audit-log"], named: ["audit-query*"] },
  auth: {
    app: ["login", "health"],
    globs: [
      "apps/web/src/routes/_auth/**",
      "apps/web/src/routes/unsubscribe.tsx",
      "apps/web/src/routes/api/email/unsubscribe.ts",
      "apps/web/src/routes/api/public/**",
    ],
    named: [
      "sign-up*",
      "register-*",
      "verification-*",
      "reset-password*",
      "*unsubscribe*",
      "public-events*",
      "public-session*",
    ],
  },
  authorization: {
    app: ["attachments", "immich"],
    named: [
      "route-guards*",
      "authorized-r2-object*",
      "r2-object-access*",
      "private-media-*",
      "technical-role-policy*",
    ],
  },
  dashboard: { app: ["dashboard", "index"] },
  donors: { app: ["donors"], named: ["part{y,ies}*", "donor*"] },
  events: {
    app: ["events", "expenses", "media"],
    globs: ["apps/web/src/routes/api/public/**"],
    named: [
      "event*",
      "team-event*",
      "notify-team-event*",
      "notify-event-*",
      "*rsvp*",
      "series-*",
      "rrule*",
      "*public-events*",
      "*weekly-events*",
      "weekly-digest*",
      "expire-event*",
      "process-*event*",
      "remind-feedback*",
      "remind-photo*",
      "immich*",
      "social-recap*",
      "expense-charge*",
      "lead-approval*",
      "materialize-occurrences*",
    ],
  },
  finance: {
    app: [
      "finance",
      "books",
      "budgets",
      "grants",
      "audit-pack",
      "utilisation-certificates",
    ],
    named: [
      "books*",
      "budget*",
      "grant*",
      "ledger*",
      "ca-workbook*",
      "audited-figures*",
      "audit-pack*",
      "*utilisation*",
      "provision*",
      "*fiscal-years*",
      "outcomes*",
    ],
  },
  governance: {
    app: ["governance", "signing"],
    globs: ["apps/web/src/routes/accept-policies.tsx"],
    named: [
      "governance*",
      "meeting*",
      "*resolution*",
      "*declaration*",
      "compliance*",
      "polic{y,ies}*",
      "safeguarding*",
      "trustee*",
      "signing*",
      "*held-notification*",
      "retimestamp-*",
      "remind-trustee*",
      "seed-governance*",
    ],
  },
  income: {
    app: [
      "income",
      "donation-certificates",
      "donation-filings",
      "razorpay",
      "receipts",
    ],
    globs: ["apps/web/src/routes/verify/**"],
    named: [
      "income*",
      "*contribution*",
      "*donation*",
      "receipt*",
      "razorpay*",
      "give-do*",
      "gateway-settlement*",
      "settlements*",
      "import-batch*",
      "imports.ts",
      "bank-statement*",
      "statement-line*",
      "bank-debits*",
      "refund-rules*",
      "import-hash*",
      "import-retention*",
      "expire-import-rows*",
    ],
  },
  jobs: {
    app: ["jobs", "notification-delivery", "whatsapp"],
    globs: ["apps/web/src/routes/api/email/webhook.ts"],
    named: [
      "notification-delivery*",
      "email-message*",
      "email-batch*",
      "email-suppression*",
      "email-delivery*",
      "gowa*",
      "whatsapp-message*",
      "whatsapp-cloud-webhook*",
    ],
  },
  kalakriti: {
    app: ["kalakriti"],
    globs: ["apps/web/src/routes/kalakriti/**"],
    named: ["*kalakriti*", "volunteer-age*"],
  },
  reimbursements: {
    app: ["reimbursements", "export", "financial-export"],
    named: [
      "*reimbursement*",
      "*advance-payment*",
      "claimant*",
      "lead-approval*",
      "*cash-voucher*",
      "*voucher*",
      "payee-signature*",
      "payout-account*",
      "financial-export*",
      "expense-categor*",
      "expense-charge*",
      "submission-*",
      "approval-policy*",
      "void*",
      "payment-proof*",
      "request-*",
      "remind-stale-requests*",
    ],
  },
  roles: { app: ["roles"], named: ["role-admin*", "resolve-permissions*"] },
  "scheduled-messages": {
    app: ["scheduled-messages"],
    named: ["*scheduled*"],
  },
  settings: {
    app: ["settings", "whatsapp-groups"],
    named: [
      "app-config*",
      "bank-account*",
      "cost-centre*",
      "use-cost-centres*",
      "expense-categor*",
      "finance-dimensions*",
      "seed-finance-dimensions*",
      "notification-preference*",
      "whatsapp-group*",
      "scan-whatsapp-groups*",
      "social-api-token*",
      "razorpay-settings*",
    ],
  },
  sidebar: { globs: ["apps/web/src/routes/_app/$.tsx"] },
  social: { app: ["social"], named: ["social*"] },
  teams: {
    app: ["teams"],
    named: ["team.ts", "notify-team.ts", "team-utils*", "whatsapp-group*"],
  },
  users: {
    app: ["users", "avatar"],
    named: [
      "user-admin*",
      "user.ts",
      "users*",
      "user-hover*",
      "notify-user-admin*",
      "sync-user*",
      "admin-users-cache*",
      "admin-actions*",
      "*contacts*",
      "use-user-contact*",
      "reactivation*",
      "avatar*",
    ],
  },
  vendors: { app: ["vendors", "vendor-payments"], named: ["*vendor*"] },
} satisfies Record<string, Area>;

/**
 * The areas, besides its own, whose specs read the fixtures a module in
 * helpers/seed/ inserts, by name, by ID or through a helper. A change to
 * `seed/<area>.ts` selects that area and these. A module without an entry
 * runs the full suite, as do core.ts and seed-test-user.ts.
 */
export const seedReaders: Record<string, string[]> = {
  audit: [],
  authorization: ["events"],
  events: ["reimbursements", "settings", "teams", "vendors"],
  governance: ["finance"],
  income: ["donors", "finance"],
  kalakriti: [],
  reimbursements: ["events"],
  "scheduled-messages": [],
};

/** Files every spec depends on: a change runs the whole suite. */
export const fullSuite = [
  ".github/workflows/ci.yml",
  ".github/ci.env",
  "bun.lock",
  "**/package.json",
  "**/turbo.json",
  "scripts/build-e2e.sh",
  "apps/web/server/**",
  "apps/web/vite.config.*",
  "apps/web/src/router.tsx",
  "apps/web/src/start.ts",
  "apps/web/src/{context,middleware}/**",
  "apps/web/src/routes/{__root,_app,_auth}.tsx",
  "apps/web/src/routes/api/{auth,zero}/**",
  "packages/auth/src/**",
  "packages/env/src/**",
  "packages/db/scripts/migrate.ts",
  "packages/zero/scripts/{prepare-publication,publication}.ts",
  "packages/e2e/{playwright.config,global-setup,shard-by-duration,duration-reporter,failure-reporter}.ts",
  "packages/e2e/fake-*.ts",
  "packages/e2e/.env.test",
  "packages/e2e/fixtures/**",
  "packages/e2e/helpers/seed-test-user.ts",
  "packages/e2e/helpers/seed/core.ts",
];

/** Files no spec can observe. */
export const ignored = [
  "**/*.md",
  "docs/**",
  ".ruler/**",
  ".agents/**",
  ".claude/**",
  ".codex/**",
  ".amp/**",
  ".vscode/**",
  ".github/CODEOWNERS",
  ".github/workflows/{boat-bench,pr-title,signing-helper}.yml",
  "**/.gitignore",
  ".worktreeinclude",
  "**/*.test.{ts,tsx}",
  "**/*.test.sh",
  "**/*.test-helper.ts",
  "**/*.test-fixtures.ts",
  "**/__tests__/**",
  "**/vitest.config.ts",
  "Dockerfile",
  ".dockerignore",
  "**/docker-compose*.yml",
  ".env.sample",
  "commitlint.config.js",
  "knip.json",
  "lefthook.yml",
  "oxfmt.config.ts",
  "oxlint.config.ts",
  "renovate.json",
  "skills-lock.json",
  "scripts/*.ts",
  "scripts/performance/**",
  "scripts/{cloud-session-start,cloud-setup,dev-kill,test-hash-consistency,worktree-ports,worktree-setup,worktree-smoke-test,worktree-teardown}.sh",
  "apps/web/scripts/**",
  "apps/web/test-unit.sh",
  "packages/db/drizzle.config.ts",
  "packages/db/scripts/{backfill-accounts,migrate-legacy-data}.ts",
  "packages/zero/scripts/{analyze,verify-kalakriti-operation-integration}.ts",
  "packages/e2e/{run-e2e.sh,run-two-stacks.ts,partition-specs.ts,stack-workspace.ts,process-cleanup.sh,tsconfig.json}",
  "packages/e2e/{select-tests,test-areas,check-e2e-map}.ts",
  "packages/e2e/perf/**",
  "packages/e2e/helpers/seed-dev-data.ts",
  "services/signing/tests/**",
  "services/signing-helper/**",
];

/** Navigation shared by every page: covered by the sidebar and authorization areas. */
export const layout = [
  "apps/web/src/lib/{nav-items,settings-sections,breadcrumbs}.ts",
  "apps/web/src/components/layout/**",
];
export const layoutAreas = ["sidebar", "authorization"] as const;

/**
 * Files that import every module of a kind. The import graph does not pass
 * through them, or every mutator, query, table and job would look global.
 * A file the graph reaches only through one needs an area. A change to one
 * selects the modules its changed import, export and object-entry lines
 * name; any other changed line runs the full suite.
 */
export const registries = [
  "packages/zero/src/{mutators,queries,schema}.ts",
  "packages/db/src/schema/index.ts",
  "packages/db/src/schema/private/index.ts",
  "apps/web/src/components/zero-init.tsx",
  "packages/jobs/src/handlers/index.ts",
  "apps/web/src/routeTree.gen.ts",
];

/**
 * Generated files, and the Zero schema's generator config: skipped when the
 * same diff changes their source, which selects for itself, and the full
 * suite otherwise.
 */
export const generated = [
  { files: "packages/zero/src/schema.ts", from: "packages/db/src/schema/**" },
  {
    files: "packages/zero/drizzle-zero.config.ts",
    from: "packages/db/src/schema/**",
  },
  { files: "packages/db/src/migrations/**", from: "packages/db/src/schema/**" },
  { files: "apps/web/src/routeTree.gen.ts", from: "apps/web/src/routes/**" },
];

/**
 * The signing service and its test PKI: governance and every spec that signs
 * through the DSC helper.
 */
export const signing = ["services/signing/**", "packages/e2e/signing/**"];
export const signingHelper = "packages/e2e/helpers/dsc-helper.ts";

/**
 * The role, exclusive_last and live-Edition spec lists. A change selects the
 * specs its changed lines name, and runs the full suite when another line
 * changes or a spec leaves exclusiveLastSpecs or singleLiveEditionSpecs.
 */
export const projectSelection = "packages/e2e/project-selection.ts";
