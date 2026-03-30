export const PERMISSIONS = [
  // ── Reimbursements & Payments ──
  {
    id: "requests.create",
    name: "Create Reimbursements",
    category: "reimbursements",
    description: "Submit reimbursements, advance payments, vendor payments",
  },
  {
    id: "requests.view_own",
    name: "View Own Reimbursements",
    category: "reimbursements",
    description: "See your own submitted reimbursements and payments",
  },
  {
    id: "requests.view_all",
    name: "View All Reimbursements",
    category: "reimbursements",
    description: "See all users' reimbursements and payments",
  },
  {
    id: "requests.edit_own",
    name: "Edit Own Reimbursements",
    category: "reimbursements",
    description: "Edit your own pending reimbursements",
  },
  {
    id: "requests.edit_all",
    name: "Edit All Reimbursements",
    category: "reimbursements",
    description: "Edit any user's pending reimbursements",
  },
  {
    id: "requests.delete_own",
    name: "Delete Own Reimbursements",
    category: "reimbursements",
    description: "Delete your own pending reimbursements",
  },
  {
    id: "requests.delete_all",
    name: "Delete All Reimbursements",
    category: "reimbursements",
    description: "Delete any user's reimbursements",
  },
  {
    id: "requests.approve",
    name: "Approve/Reject Reimbursements",
    category: "reimbursements",
    description: "Approve or reject pending reimbursements and payments",
  },
  {
    id: "requests.record_payment",
    name: "Record Payments",
    category: "reimbursements",
    description: "Record payment transactions against approved vendor payments",
  },
  {
    id: "requests.export",
    name: "Export Reimbursements",
    category: "reimbursements",
    description: "Export reimbursement and payment data to CSV",
  },

  // ── Vendors ──
  {
    id: "vendors.create",
    name: "Create Vendors",
    category: "vendors",
    description: "Submit new vendors (pending approval)",
  },
  {
    id: "vendors.view_approved",
    name: "View Approved Vendors",
    category: "vendors",
    description: "See approved vendors list",
  },
  {
    id: "vendors.view_all",
    name: "View All Vendors",
    category: "vendors",
    description: "See all vendors including pending",
  },
  {
    id: "vendors.edit",
    name: "Edit Vendors",
    category: "vendors",
    description: "Edit vendor details",
  },
  {
    id: "vendors.delete",
    name: "Delete Vendors",
    category: "vendors",
    description: "Delete vendors (blocked if has payments)",
  },
  {
    id: "vendors.approve",
    name: "Approve/Unapprove Vendors",
    category: "vendors",
    description: "Approve or unapprove vendors",
  },

  // ── Users ──
  {
    id: "users.view",
    name: "View Users",
    category: "users",
    description: "See user list",
  },
  {
    id: "users.create",
    name: "Create Users",
    category: "users",
    description: "Create new user accounts",
  },
  {
    id: "users.edit",
    name: "Edit Users",
    category: "users",
    description: "Edit user profiles, assign roles",
  },
  {
    id: "users.delete",
    name: "Delete Users",
    category: "users",
    description: "Delete user accounts",
  },
  {
    id: "users.ban",
    name: "Ban/Unban Users",
    category: "users",
    description: "Ban or unban user accounts",
  },
  {
    id: "users.set_password",
    name: "Set User Passwords",
    category: "users",
    description: "Reset user passwords",
  },

  // ── Teams ──
  {
    id: "teams.view_own",
    name: "View Own Teams",
    category: "teams",
    description: "See teams you belong to",
  },
  {
    id: "teams.view_all",
    name: "View All Teams",
    category: "teams",
    description: "See all teams",
  },
  {
    id: "teams.create",
    name: "Create Teams",
    category: "teams",
    description: "Create new teams",
  },
  {
    id: "teams.edit",
    name: "Edit Teams",
    category: "teams",
    description: "Edit team details",
  },
  {
    id: "teams.delete",
    name: "Delete Teams",
    category: "teams",
    description: "Delete teams (cascades members)",
  },
  {
    id: "teams.manage_members",
    name: "Manage Team Members",
    category: "teams",
    description:
      "Add/remove members, set roles (also granted to team leads for their team)",
  },

  // ── Events ──
  {
    id: "events.view_own",
    name: "View Own Events",
    category: "events",
    description: "See events you're a member of + public events",
  },
  {
    id: "events.view_all",
    name: "View All Events",
    category: "events",
    description: "See all events across all teams",
  },
  {
    id: "events.create",
    name: "Create Events",
    category: "events",
    description: "Create team events (also granted to team leads)",
  },
  {
    id: "events.edit",
    name: "Edit Events",
    category: "events",
    description: "Edit event details (also granted to team leads)",
  },
  {
    id: "events.cancel",
    name: "Cancel Events",
    category: "events",
    description: "Cancel events (also granted to team leads)",
  },
  {
    id: "events.manage_members",
    name: "Manage Event Members",
    category: "events",
    description: "Add/remove event members (also granted to team leads)",
  },
  {
    id: "events.manage_photos",
    name: "Manage Photos",
    category: "events",
    description: "Approve/reject event photos (also granted to team leads)",
  },
  {
    id: "events.manage_interest",
    name: "Manage Interest",
    category: "events",
    description:
      "Approve/reject volunteer interest in events (also granted to team leads)",
  },
  {
    id: "events.manage_attendance",
    name: "Manage Attendance",
    category: "events",
    description:
      "Mark attendance for event members (also granted to team leads)",
  },
  {
    id: "events.manage_feedback",
    name: "Manage Feedback",
    category: "events",
    description:
      "Toggle feedback, set deadline, view anonymous responses (also granted to team leads)",
  },

  // ── Event Updates ──
  {
    id: "event_updates.create",
    name: "Create Event Updates",
    category: "events",
    description: "Post updates to events (also granted to team leads)",
  },
  {
    id: "event_updates.edit_own",
    name: "Edit Own Updates",
    category: "events",
    description: "Edit your own event updates",
  },
  {
    id: "event_updates.edit_all",
    name: "Edit All Updates",
    category: "events",
    description: "Edit any user's event updates",
  },
  {
    id: "event_updates.delete_own",
    name: "Delete Own Updates",
    category: "events",
    description: "Delete your own event updates",
  },
  {
    id: "event_updates.delete_all",
    name: "Delete All Updates",
    category: "events",
    description: "Delete any user's event updates",
  },

  // ── Settings ──
  {
    id: "settings.expense_categories",
    name: "Expense Categories",
    category: "settings",
    description: "CRUD expense categories",
  },
  {
    id: "settings.whatsapp_groups",
    name: "WhatsApp Groups",
    category: "settings",
    description: "CRUD WhatsApp groups",
  },
  {
    id: "settings.app_config",
    name: "App Config",
    category: "settings",
    description: "Manage app configuration",
  },
  {
    id: "settings.roles",
    name: "Manage Roles",
    category: "settings",
    description: "CRUD roles and assign permissions",
  },

  // ── Bank Accounts (user-scoped) ──
  {
    id: "bank_accounts.manage_own",
    name: "Manage Own Bank Accounts",
    category: "bank_accounts",
    description: "Create/delete/set default on your own bank accounts",
  },
] as const;

export type PermissionId = (typeof PERMISSIONS)[number]["id"];

export const PERMISSION_IDS = new Set<string>(PERMISSIONS.map((p) => p.id));

/** Baseline permissions granted to the oriented volunteer role */
export const VOLUNTEER_BASELINE_PERMISSIONS: readonly PermissionId[] = [
  "requests.create",
  "requests.view_own",
  "requests.edit_own",
  "requests.delete_own",
  "requests.record_payment",
  "vendors.create",
  "teams.view_own",
  "events.view_own",
  "event_updates.edit_own",
  "event_updates.delete_own",
  "bank_accounts.manage_own",
];

/** Minimal permissions for unoriented volunteers (pre-orientation signup default) */
export const UNORIENTED_VOLUNTEER_PERMISSIONS: readonly PermissionId[] = [
  "events.view_own",
];
