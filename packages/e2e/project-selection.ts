// Add a file only when every test in it is gated to the same role.
const roleOnlySpecs = {
  super_admin: [
    "events/event-create.spec.ts",
    "events/event-duplicate.spec.ts",
    "events/event-edit-cancel.spec.ts",
    "events/event-expenses.spec.ts",
    "events/event-interest-approval.spec.ts",
    "events/event-members.spec.ts",
    "events/event-time-filter.spec.ts",
    "events/event-updates.spec.ts",
    "events/photo-notifications.spec.ts",
    "events/public-events-filters.spec.ts",
    "events/recurring-event-exclusions.spec.ts",
    "events/recurring-event-scope.spec.ts",
    "events/recurring-events.spec.ts",
    "events/rsvp-poll-lead-time.spec.ts",
    "kalakriti/center-registration-controls.spec.ts",
    "kalakriti/center-transport.spec.ts",
    "kalakriti/edition-creation.spec.ts",
    "kalakriti/eligibility-configuration.spec.ts",
    "kalakriti/guardian-invite.spec.ts",
    "kalakriti/guardian-lifecycle-concurrency.spec.ts",
    "kalakriti/inventory.spec.ts",
    "kalakriti/lifecycle-readiness.spec.ts",
    "kalakriti/navigation-preloading.spec.ts",
    "kalakriti/person-qr.spec.ts",
    "kalakriti/registration-release-authorization.spec.ts",
    "kalakriti/student-registration.spec.ts",
    "kalakriti/volunteer-assignment.spec.ts",
    "performance/app.spec.ts",
    "performance/kalakriti.spec.ts",
    "reimbursements/cash-voucher.spec.ts",
    "reimbursements/reimbursement-unhappy-paths.spec.ts",
    "settings/expense-categories.spec.ts",
    "settings/whatsapp-groups.spec.ts",
    "teams/team-create.spec.ts",
    "users/create-user-unhappy-paths.spec.ts",
    "vendors/vendor-approval.spec.ts",
    "vendors/vendor-payment-unhappy-paths.spec.ts",
    "vendors/vendor-unhappy-paths.spec.ts",
  ],
  admin: ["roles/admin-flows.spec.ts"],
  finance_admin: [],
  volunteer: [
    "authorization/api-authorization-expanded.spec.ts",
    "events/event-interest-unhappy-paths.spec.ts",
    "kalakriti/entry-music-edit.spec.ts",
  ],
  unoriented_volunteer: [
    "roles/unoriented-volunteer-flows.spec.ts",
    "settings/bank-accounts.spec.ts",
  ],
} as const;

type RoleProject = keyof typeof roleOnlySpecs;

const releaseInvariantSpecs = [
  "kalakriti/golive.spec.ts",
  "kalakriti/operations-person-qr.spec.ts",
  "kalakriti/event-day-transport.spec.ts",
  "kalakriti/event-day-stations.spec.ts",
  "kalakriti/guests-judges.spec.ts",
  "kalakriti/food-entry-scopes.spec.ts",
  "kalakriti/table-sizing.spec.ts",
  "kalakriti/public-schedule.spec.ts",
  "kalakriti/release-database-races.spec.ts",
  "kalakriti/results.spec.ts",
  "kalakriti/role-dashboard.spec.ts",
];

const specPattern = (file: string) =>
  new RegExp(`/${file.replaceAll(".", "\\.")}$`);

export const releaseInvariantPatterns = releaseInvariantSpecs.map(specPattern);

export function testIgnoreForRole(
  role: RoleProject,
  existing: RegExp[]
): RegExp[] {
  return [
    ...existing,
    ...releaseInvariantPatterns,
    ...Object.entries(roleOnlySpecs).flatMap(([owner, files]) =>
      owner === role ? [] : files.map(specPattern)
    ),
  ];
}
