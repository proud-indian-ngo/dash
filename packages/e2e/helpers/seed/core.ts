import path from "node:path";

import { auth } from "@pi-dash/auth";
import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { bankAccount } from "@pi-dash/db/schema/bank-account";
import { eventUpdate } from "@pi-dash/db/schema/event-update";
import { expenseCategory } from "@pi-dash/db/schema/expense-category";
import { costCentre } from "@pi-dash/db/schema/finance-dimensions";
import { role, rolePermission } from "@pi-dash/db/schema/permission";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import {
  vendorPayment,
  vendorPaymentLineItem,
} from "@pi-dash/db/schema/vendor";
import { ensureFinanceDimensions } from "@pi-dash/db/seed-finance-dimensions";
import { ensureVendor } from "@pi-dash/db/seed-vendors";
import { syncPermissions } from "@pi-dash/db/sync-permissions";
import { subDays } from "date-fns";
import dotenv from "dotenv";
import { and, eq, like } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../../.env.test"),
  quiet: true,
});

export const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

type TestUserRole =
  | "super_admin"
  | "admin"
  | "finance_admin"
  | "volunteer"
  | "unoriented_volunteer";

interface TestUser {
  email: string;
  name: string;
  password: string;
  role: TestUserRole;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set in .env.test`);
  }
  return value;
}

const TEST_USERS: TestUser[] = [
  {
    email: requiredEnv("SUPER_ADMIN_EMAIL"),
    name: "Test Super Admin",
    password: requiredEnv("SUPER_ADMIN_PASSWORD"),
    role: "super_admin",
  },
  {
    email: requiredEnv("ADMIN_EMAIL"),
    name: "Test Admin",
    password: requiredEnv("ADMIN_PASSWORD"),
    role: "admin",
  },
  {
    email: requiredEnv("FINANCE_ADMIN_EMAIL"),
    name: "Test Finance Admin",
    password: requiredEnv("FINANCE_ADMIN_PASSWORD"),
    role: "finance_admin",
  },
  {
    email: requiredEnv("VOLUNTEER_EMAIL"),
    name: "Test Volunteer",
    password: requiredEnv("VOLUNTEER_PASSWORD"),
    role: "volunteer",
  },
  {
    email: requiredEnv("UNORIENTED_VOLUNTEER_EMAIL"),
    name: "Test Unoriented Volunteer",
    password: requiredEnv("UNORIENTED_VOLUNTEER_PASSWORD"),
    role: "unoriented_volunteer",
  },
];

const SEED_CATEGORIES = ["Travel", "Food", "Accommodation", "Supplies"];
const RESERVED_PERMISSION_PROBE_ROLE_ID = "e2e_reserved_permission_probe";

async function verifyReservedPermissionSync(): Promise<void> {
  await db
    .insert(role)
    .values({
      description: "E2E permission sync probe",
      id: RESERVED_PERMISSION_PROBE_ROLE_ID,
      isSystem: false,
      name: "E2E Permission Sync Probe",
    })
    .onConflictDoNothing();
  await db
    .insert(rolePermission)
    .values({
      permissionId: "requests.export",
      roleId: RESERVED_PERMISSION_PROBE_ROLE_ID,
    })
    .onConflictDoNothing();

  try {
    await syncPermissions();
    const grants = await db
      .select({ roleId: rolePermission.roleId })
      .from(rolePermission)
      .where(eq(rolePermission.permissionId, "requests.export"));
    const roleIds = grants.map((grant) => grant.roleId).sort();
    if (roleIds.length !== 1 || roleIds[0] !== "super_admin") {
      throw new Error(
        `Reserved permission sync left unexpected grants: ${roleIds.join(", ")}`
      );
    }
  } finally {
    await db.delete(role).where(eq(role.id, RESERVED_PERMISSION_PROBE_ROLE_ID));
  }
}

async function ensureTestUser(testUser: TestUser): Promise<string> {
  const existing = await db.query.user.findFirst({
    columns: { id: true, role: true },
    where: (table, ops) => ops.eq(table.email, testUser.email),
  });

  if (!existing) {
    await auth.api.createUser({
      body: {
        email: testUser.email,
        name: testUser.name,
        password: testUser.password,
      },
    });
    log(`Created test user: ${testUser.email}`);
  }

  const record = await db.query.user.findFirst({
    columns: { emailVerified: true, id: true, role: true },
    where: (table, ops) => ops.eq(table.email, testUser.email),
  });

  if (!record) {
    throw new Error(`Unable to find user: ${testUser.email}`);
  }

  const updates: Record<string, unknown> = {};

  if (record.role !== testUser.role) {
    updates.role = testUser.role;
  }

  if (!record.emailVerified) {
    updates.emailVerified = true;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(user).set(updates).where(eq(user.id, record.id));
    log(`Updated ${testUser.email}: ${JSON.stringify(updates)}`);
  } else {
    log(`Test user ready: ${testUser.email} (${testUser.role})`);
  }

  return record.id;
}

/** Roles, permissions and finance dimensions every spec relies on. */
export async function ensureRolesAndPermissions(): Promise<void> {
  await syncPermissions();
  await ensureFinanceDimensions();
  // Cost centres a spec added and left active (a run stopped part way)
  // would make every event and request form ask for a city: close them.
  await db
    .update(costCentre)
    .set({ active: false, updatedAt: new Date() })
    .where(and(like(costCentre.code, "E2E%"), eq(costCentre.active, true)));
  await verifyReservedPermissionSync();
  log("Synced roles and permissions");
}

interface TestUserIds {
  adminUserId: string;
  financeAdminUserId: string;
  superAdminUserId: string;
  unorientedUserId: string;
  volunteerUserId: string;
}

export async function ensureTestUsers(): Promise<TestUserIds> {
  let superAdminUserId = "";
  let adminUserId = "";
  let financeAdminUserId = "";
  let unorientedUserId = "";
  let volunteerUserId = "";
  await Promise.all(
    TEST_USERS.map(async (testUser) => {
      const userId = await ensureTestUser(testUser);
      await ensureBankAccount(userId);
      if (testUser.role === "super_admin") {
        superAdminUserId = userId;
      } else if (testUser.role === "admin") {
        adminUserId = userId;
      } else if (testUser.role === "finance_admin") {
        financeAdminUserId = userId;
      } else if (testUser.role === "unoriented_volunteer") {
        unorientedUserId = userId;
      } else if (testUser.role === "volunteer") {
        volunteerUserId = userId;
      }
    })
  );
  return {
    adminUserId,
    financeAdminUserId,
    superAdminUserId,
    unorientedUserId,
    volunteerUserId,
  };
}

export async function ensureExpenseCategories(): Promise<void> {
  await Promise.all(
    SEED_CATEGORIES.map(async (name) => {
      const existing = await db.query.expenseCategory.findFirst({
        where: (table, ops) => ops.eq(table.name, name),
      });
      if (!existing) {
        const now = new Date();
        await db.insert(expenseCategory).values({
          createdAt: now,
          id: uuidv7(),
          name,
          updatedAt: now,
        });
        log(`Created expense category: ${name}`);
      }
    })
  );
}

async function ensureBankAccount(userId: string): Promise<void> {
  const existing = await db.query.bankAccount.findFirst({
    where: (table, ops) => ops.eq(table.userId, userId),
  });
  if (!existing) {
    const now = new Date();
    await db.insert(bankAccount).values({
      accountName: "Test Savings",
      accountNumber: "1234567890",
      createdAt: now,
      id: uuidv7(),
      ifscCode: "TEST0000001",
      isDefault: true,
      updatedAt: now,
      userId,
    });
    log(`Created bank account for user: ${userId}`);
  }
}

/** The reimbursements fixture seeds it; the R2 authorization fixture attaches files to it. */
export const SEED_REIMBURSEMENT_ID = "e2e00000-0000-0000-0000-000000000001";
/** The event vendor, which the reimbursements export fixture also pays. */
export const SEED_VENDOR_ID = "e2e00000-0000-0000-0000-000000000003";
const SEED_VENDOR_PAYMENT_ID = "e2e00000-0000-0000-0000-000000000004";
/** Seeded by the authorization fixtures; the events fixtures add an event to it. */
export const ZERO_AUTH_LEAD_TEAM_ID = "e2e00000-0000-0000-0000-000000000102";

export const plateTextContent = (text: string): string =>
  JSON.stringify([{ children: [{ text }], type: "p" }]);

/** Read by the events, governance and reimbursements specs. */
export async function ensureEventVendorPayment(
  userId: string,
  eventId: string
): Promise<void> {
  const now = new Date();
  const vendorId = SEED_VENDOR_ID;
  // Idempotent, so an older database also gains the private details.
  await ensureVendor({
    createdAt: now,
    createdBy: userId,
    id: vendorId,
    name: "E2E Event Vendor",
    private: {
      bankAccountIfscCode: "TEST0000002",
      bankAccountName: "E2E Vendor Account",
      bankAccountNumber: "9876543210",
      contactPhone: "+919999999999",
    },
    status: "approved",
  });

  const existingPayment = await db.query.vendorPayment.findFirst({
    where: (table, ops) => ops.eq(table.id, SEED_VENDOR_PAYMENT_ID),
  });
  if (existingPayment) {
    return;
  }

  const category = await db.query.expenseCategory.findFirst();
  if (!category) {
    log("Skipping event vendor payment seed — no categories found");
    return;
  }

  await db.insert(vendorPayment).values({
    chargedTo: "event",
    createdAt: now,
    eventId,
    id: SEED_VENDOR_PAYMENT_ID,
    status: "pending",
    submittedAt: now,
    title: "E2E Event Vendor Payment",
    updatedAt: now,
    userId,
    vendorId,
  });

  await db.insert(vendorPaymentLineItem).values({
    amountPaise: 62500,
    categoryId: category.id,
    createdAt: now,
    description: "Event vendor supplies",
    id: uuidv7(),
    sortOrder: 0,
    updatedAt: now,
    vendorPaymentId: SEED_VENDOR_PAYMENT_ID,
  });

  log("Created event vendor payment");
}

const SEED_TEAM_NAME = "E2E Updates Team";
export const SEED_EVENT_NAME = "E2E Past Event With Pending Update";
const SEED_PENDING_UPDATE_CONTENT = plateTextContent(
  "This is a pending update from a volunteer that needs admin approval."
);

export async function ensureEventWithPendingUpdate(
  adminUserId: string,
  volunteerUserId: string
): Promise<string> {
  const existingTeam = await db.query.team.findFirst({
    where: (table, ops) => ops.eq(table.name, SEED_TEAM_NAME),
  });
  if (existingTeam) {
    log("E2E Updates Team already exists — skipping");
    return existingTeam.id;
  }

  const now = new Date();
  const yesterday = subDays(now, 1);

  // Create team
  const teamId = uuidv7();
  await db.insert(team).values({
    createdAt: now,
    description: "Team for E2E update approval tests",
    id: teamId,
    name: SEED_TEAM_NAME,
    updatedAt: now,
  });

  // Add admin and volunteer as team members
  await db.insert(teamMember).values([
    {
      id: uuidv7(),
      joinedAt: now,
      role: "lead",
      teamId,
      userId: adminUserId,
    },
    {
      id: uuidv7(),
      joinedAt: now,
      role: "member",
      teamId,
      userId: volunteerUserId,
    },
  ]);

  // Create a past event (started yesterday) so the Updates tab is visible
  const eventId = uuidv7();
  await db.insert(teamEvent).values({
    createdAt: subDays(now, 3),
    createdBy: adminUserId,
    description: "Past event with a pending update for E2E testing",
    id: eventId,
    isPublic: true,
    name: SEED_EVENT_NAME,
    startTime: yesterday,
    teamId,
    updatedAt: subDays(now, 3),
  });

  // Add both users as event members
  await db.insert(teamEventMember).values([
    {
      addedAt: subDays(now, 3),
      eventId,
      id: uuidv7(),
      userId: adminUserId,
    },
    {
      addedAt: subDays(now, 3),
      eventId,
      id: uuidv7(),
      userId: volunteerUserId,
    },
  ]);

  // Create a pending update from the volunteer
  await db.insert(eventUpdate).values({
    content: SEED_PENDING_UPDATE_CONTENT,
    createdAt: yesterday,
    createdBy: volunteerUserId,
    eventId,
    id: uuidv7(),
    status: "pending",
    updatedAt: yesterday,
  });

  log("Created E2E team, past event, and pending update");
  return teamId;
}
