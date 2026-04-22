import path from "node:path";
import { auth } from "@pi-dash/auth";
import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { bankAccount } from "@pi-dash/db/schema/bank-account";
import { eventUpdate } from "@pi-dash/db/schema/event-update";
import { expenseCategory } from "@pi-dash/db/schema/expense-category";
import {
  reimbursement,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { syncPermissions } from "@pi-dash/db/sync-permissions";
import { addDays, addHours, subDays } from "date-fns";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

dotenv.config({
  path: path.resolve(import.meta.dirname, "../.env.test"),
  quiet: true,
});

const log = (message: string): void => {
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

const TEST_USERS: TestUser[] = [
  {
    email: process.env.SUPER_ADMIN_EMAIL ?? "test-super-admin@pi-dash.test",
    password: process.env.SUPER_ADMIN_PASSWORD ?? "TestSuperAdmin123!",
    name: "Test Super Admin",
    role: "super_admin",
  },
  {
    email: process.env.ADMIN_EMAIL ?? "test-admin@pi-dash.test",
    password: process.env.ADMIN_PASSWORD ?? "TestAdmin123!",
    name: "Test Admin",
    role: "admin",
  },
  {
    email: process.env.FINANCE_ADMIN_EMAIL ?? "test-finance-admin@pi-dash.test",
    password: process.env.FINANCE_ADMIN_PASSWORD ?? "TestFinanceAdmin123!",
    name: "Test Finance Admin",
    role: "finance_admin",
  },
  {
    email: process.env.VOLUNTEER_EMAIL ?? "test-volunteer@pi-dash.test",
    password: process.env.VOLUNTEER_PASSWORD ?? "TestVolunteer123!",
    name: "Test Volunteer",
    role: "volunteer",
  },
  {
    email:
      process.env.UNORIENTED_VOLUNTEER_EMAIL ??
      "test-unoriented-volunteer@pi-dash.test",
    password: process.env.UNORIENTED_VOLUNTEER_PASSWORD ?? "TestUnoriented123!",
    name: "Test Unoriented Volunteer",
    role: "unoriented_volunteer",
  },
];

const SEED_CATEGORIES = ["Travel", "Food", "Accommodation", "Supplies"];

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
    columns: { id: true, role: true, emailVerified: true },
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

async function ensureExpenseCategories(): Promise<void> {
  for (const name of SEED_CATEGORIES) {
    const existing = await db.query.expenseCategory.findFirst({
      where: (table, ops) => ops.eq(table.name, name),
    });
    if (!existing) {
      const now = new Date();
      await db.insert(expenseCategory).values({
        id: uuidv7(),
        name,
        createdAt: now,
        updatedAt: now,
      });
      log(`Created expense category: ${name}`);
    }
  }
}

async function ensureBankAccount(userId: string): Promise<void> {
  const existing = await db.query.bankAccount.findFirst({
    where: (table, ops) => ops.eq(table.userId, userId),
  });
  if (!existing) {
    const now = new Date();
    await db.insert(bankAccount).values({
      id: uuidv7(),
      userId,
      accountName: "Test Savings",
      accountNumber: "1234567890",
      ifscCode: "TEST0000001",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
    log(`Created bank account for user: ${userId}`);
  }
}

const TEST_WHATSAPP_GROUP = {
  name: "E2E Test Group",
  jid: "e2e-test-group@g.us",
};

async function ensureWhatsAppGroup(): Promise<void> {
  const existing = await db.query.whatsappGroup.findFirst({
    where: (table, ops) => ops.eq(table.jid, TEST_WHATSAPP_GROUP.jid),
  });
  if (!existing) {
    const now = new Date();
    await db.insert(whatsappGroup).values({
      id: uuidv7(),
      name: TEST_WHATSAPP_GROUP.name,
      jid: TEST_WHATSAPP_GROUP.jid,
      createdAt: now,
      updatedAt: now,
    });
    log(`Created WhatsApp group: ${TEST_WHATSAPP_GROUP.name}`);
  }
}

const SEED_REIMBURSEMENT_ID = "e2e00000-0000-0000-0000-000000000001";

async function ensureReimbursement(userId: string): Promise<void> {
  const existing = await db.query.reimbursement.findFirst({
    where: (table, ops) => ops.eq(table.id, SEED_REIMBURSEMENT_ID),
  });
  if (existing) {
    return;
  }

  const category = await db.query.expenseCategory.findFirst();
  if (!category) {
    log("Skipping reimbursement seed — no expense categories found");
    return;
  }

  const now = new Date();
  await db.insert(reimbursement).values({
    id: SEED_REIMBURSEMENT_ID,
    userId,
    title: "E2E Seed Reimbursement",
    city: "bangalore",
    expenseDate: "2026-01-15",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(reimbursementLineItem).values([
    {
      id: uuidv7(),
      reimbursementId: SEED_REIMBURSEMENT_ID,
      categoryId: category.id,
      description: "Bus fare",
      amount: "250.00",
      sortOrder: 0,
      generateVoucher: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv7(),
      reimbursementId: SEED_REIMBURSEMENT_ID,
      categoryId: category.id,
      description: "Lunch",
      amount: "150.00",
      sortOrder: 1,
      generateVoucher: true,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  log("Created seed reimbursement with 2 line items");
}

const SEED_TEAM_NAME = "E2E Updates Team";
const SEED_EVENT_NAME = "E2E Past Event With Pending Update";
const SEED_PENDING_UPDATE_CONTENT =
  "This is a pending update from a volunteer that needs admin approval.";

async function ensureEventWithPendingUpdate(
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
    id: teamId,
    name: SEED_TEAM_NAME,
    description: "Team for E2E update approval tests",
    createdAt: now,
    updatedAt: now,
  });

  // Add admin and volunteer as team members
  await db.insert(teamMember).values([
    {
      id: uuidv7(),
      teamId,
      userId: adminUserId,
      role: "lead",
      joinedAt: now,
    },
    {
      id: uuidv7(),
      teamId,
      userId: volunteerUserId,
      role: "member",
      joinedAt: now,
    },
  ]);

  // Create a past event (started yesterday) so the Updates tab is visible
  const eventId = uuidv7();
  await db.insert(teamEvent).values({
    id: eventId,
    teamId,
    name: SEED_EVENT_NAME,
    description: "Past event with a pending update for E2E testing",
    startTime: yesterday,
    isPublic: true,
    createdBy: adminUserId,
    createdAt: subDays(now, 3),
    updatedAt: subDays(now, 3),
  });

  // Add both users as event members
  await db.insert(teamEventMember).values([
    {
      id: uuidv7(),
      eventId,
      userId: adminUserId,
      addedAt: subDays(now, 3),
    },
    {
      id: uuidv7(),
      eventId,
      userId: volunteerUserId,
      addedAt: subDays(now, 3),
    },
  ]);

  // Create a pending update from the volunteer
  await db.insert(eventUpdate).values({
    id: uuidv7(),
    eventId,
    content: SEED_PENDING_UPDATE_CONTENT,
    status: "pending",
    createdBy: volunteerUserId,
    createdAt: yesterday,
    updatedAt: yesterday,
  });

  log("Created E2E team, past event, and pending update");
  return teamId;
}

interface FilterTestEvent {
  cancelled?: boolean;
  city: "bangalore" | "mumbai";
  isPublic: boolean;
  location: string;
  name: string;
  recurrenceRule?: { rrule: string };
  start: (now: Date) => Date;
}

const FILTER_TEST_EVENTS: FilterTestEvent[] = [
  {
    name: "E2E Upcoming Public Bangalore",
    isPublic: true,
    start: (now: Date) => addDays(now, 3),
    city: "bangalore",
    location: "MG Road, Bangalore",
  },
  {
    name: "E2E Upcoming Private Mumbai",
    isPublic: false,
    start: (now: Date) => addDays(now, 5),
    city: "mumbai",
    location: "Andheri West, Mumbai",
  },
  {
    name: "E2E Upcoming Recurring Public",
    isPublic: true,
    start: (now: Date) => subDays(now, 14),
    city: "bangalore",
    location: "Indiranagar, Bangalore",
    recurrenceRule: { rrule: "FREQ=WEEKLY" },
  },
  {
    name: "E2E Past Public Mumbai",
    isPublic: true,
    start: (now: Date) => subDays(now, 10),
    city: "mumbai",
    location: "Dadar, Mumbai",
  },
  {
    name: "E2E Past Private Bangalore",
    isPublic: false,
    start: (now: Date) => subDays(now, 5),
    city: "bangalore",
    location: "Koramangala, Bangalore",
  },
  {
    name: "E2E Cancelled Future Event",
    isPublic: true,
    start: (now: Date) => addDays(now, 7),
    city: "bangalore",
    location: "Cubbon Park, Bangalore",
    cancelled: true,
  },
  {
    name: "E2E Past Cancelled Event",
    isPublic: false,
    start: (now: Date) => subDays(now, 3),
    city: "mumbai",
    location: "Bandra, Mumbai",
    cancelled: true,
  },
];

async function ensureFilterTestEvents(
  teamId: string,
  adminUserId: string,
  volunteerUserId: string
): Promise<void> {
  const first = await db.query.teamEvent.findFirst({
    where: (table, ops) => ops.eq(table.name, "E2E Upcoming Public Bangalore"),
  });
  if (first) {
    log("Filter test events already exist — skipping");
    return;
  }

  const now = new Date();

  for (const e of FILTER_TEST_EVENTS) {
    const startTime = e.start(now);
    const id = uuidv7();
    await db.insert(teamEvent).values({
      id,
      teamId,
      name: e.name,
      description: `${e.name} — E2E filter test event`,
      startTime,
      endTime: addHours(startTime, 2),
      isPublic: e.isPublic,
      city: e.city,
      location: e.location,
      recurrenceRule: e.recurrenceRule,
      cancelledAt: e.cancelled ? now : undefined,
      createdBy: adminUserId,
      createdAt: subDays(now, 7),
      updatedAt: subDays(now, 7),
    });

    await db.insert(teamEventMember).values([
      { id: uuidv7(), eventId: id, userId: adminUserId, addedAt: now },
      { id: uuidv7(), eventId: id, userId: volunteerUserId, addedAt: now },
    ]);
  }

  log(`Created ${FILTER_TEST_EVENTS.length} filter test events`);
}

async function seed(): Promise<void> {
  await syncPermissions();
  log("Synced roles and permissions");

  await ensureExpenseCategories();
  await ensureWhatsAppGroup();

  let superAdminUserId = "";
  let volunteerUserId = "";
  for (const testUser of TEST_USERS) {
    const userId = await ensureTestUser(testUser);
    await ensureBankAccount(userId);
    if (testUser.role === "super_admin") {
      superAdminUserId = userId;
    } else if (testUser.role === "volunteer") {
      volunteerUserId = userId;
    }
  }

  await ensureReimbursement(superAdminUserId);
  const teamId = await ensureEventWithPendingUpdate(
    superAdminUserId,
    volunteerUserId
  );
  await ensureFilterTestEvents(teamId, superAdminUserId, volunteerUserId);
}

seed().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown error seeding test users";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
