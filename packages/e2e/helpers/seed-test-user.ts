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
    email: process.env.SUPER_ADMIN_EMAIL,
    name: "Test Super Admin",
    password: process.env.SUPER_ADMIN_PASSWORD,
    role: "super_admin",
  },
  {
    email: process.env.ADMIN_EMAIL,
    name: "Test Admin",
    password: process.env.ADMIN_PASSWORD,
    role: "admin",
  },
  {
    email: process.env.FINANCE_ADMIN_EMAIL,
    name: "Test Finance Admin",
    password: process.env.FINANCE_ADMIN_PASSWORD,
    role: "finance_admin",
  },
  {
    email: process.env.VOLUNTEER_EMAIL,
    name: "Test Volunteer",
    password: process.env.VOLUNTEER_PASSWORD,
    role: "volunteer",
  },
  {
    email: process.env.UNORIENTED_VOLUNTEER_EMAIL,
    name: "Test Unoriented Volunteer",
    password: process.env.UNORIENTED_VOLUNTEER_PASSWORD,
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

async function ensureExpenseCategories(): Promise<void> {
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

const TEST_WHATSAPP_GROUP = {
  jid: "e2e-test-group@g.us",
  name: "E2E Test Group",
};

async function ensureWhatsAppGroup(): Promise<void> {
  const existing = await db.query.whatsappGroup.findFirst({
    where: (table, ops) => ops.eq(table.jid, TEST_WHATSAPP_GROUP.jid),
  });
  if (!existing) {
    const now = new Date();
    await db.insert(whatsappGroup).values({
      createdAt: now,
      id: uuidv7(),
      jid: TEST_WHATSAPP_GROUP.jid,
      name: TEST_WHATSAPP_GROUP.name,
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
    city: "bangalore",
    createdAt: now,
    expenseDate: "2026-01-15",
    id: SEED_REIMBURSEMENT_ID,
    status: "pending",
    title: "E2E Seed Reimbursement",
    updatedAt: now,
    userId,
  });

  await db.insert(reimbursementLineItem).values([
    {
      amount: "250.00",
      categoryId: category.id,
      createdAt: now,
      description: "Bus fare",
      generateVoucher: true,
      id: uuidv7(),
      reimbursementId: SEED_REIMBURSEMENT_ID,
      sortOrder: 0,
      updatedAt: now,
    },
    {
      amount: "150.00",
      categoryId: category.id,
      createdAt: now,
      description: "Lunch",
      generateVoucher: true,
      id: uuidv7(),
      reimbursementId: SEED_REIMBURSEMENT_ID,
      sortOrder: 1,
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
    city: "bangalore",
    isPublic: true,
    location: "MG Road, Bangalore",
    name: "E2E Upcoming Public Bangalore",
    start: (now: Date) => addDays(now, 3),
  },
  {
    city: "mumbai",
    isPublic: false,
    location: "Andheri West, Mumbai",
    name: "E2E Upcoming Private Mumbai",
    start: (now: Date) => addDays(now, 5),
  },
  {
    city: "bangalore",
    isPublic: true,
    location: "Indiranagar, Bangalore",
    name: "E2E Upcoming Recurring Public",
    recurrenceRule: { rrule: "FREQ=WEEKLY" },
    start: (now: Date) => subDays(now, 14),
  },
  {
    city: "mumbai",
    isPublic: true,
    location: "Dadar, Mumbai",
    name: "E2E Past Public Mumbai",
    start: (now: Date) => subDays(now, 10),
  },
  {
    city: "bangalore",
    isPublic: false,
    location: "Koramangala, Bangalore",
    name: "E2E Past Private Bangalore",
    start: (now: Date) => subDays(now, 5),
  },
  {
    cancelled: true,
    city: "bangalore",
    isPublic: true,
    location: "Cubbon Park, Bangalore",
    name: "E2E Cancelled Future Event",
    start: (now: Date) => addDays(now, 7),
  },
  {
    cancelled: true,
    city: "mumbai",
    isPublic: false,
    location: "Bandra, Mumbai",
    name: "E2E Past Cancelled Event",
    start: (now: Date) => subDays(now, 3),
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

  await Promise.all(
    FILTER_TEST_EVENTS.map(async (e) => {
      const startTime = e.start(now);
      const id = uuidv7();
      await db.insert(teamEvent).values({
        cancelledAt: e.cancelled ? now : undefined,
        city: e.city,
        createdAt: subDays(now, 7),
        createdBy: adminUserId,
        description: `${e.name} — E2E filter test event`,
        endTime: addHours(startTime, 2),
        id,
        isPublic: e.isPublic,
        location: e.location,
        name: e.name,
        recurrenceRule: e.recurrenceRule,
        startTime,
        teamId,
        updatedAt: subDays(now, 7),
      });

      await db.insert(teamEventMember).values([
        { addedAt: now, eventId: id, id: uuidv7(), userId: adminUserId },
        { addedAt: now, eventId: id, id: uuidv7(), userId: volunteerUserId },
      ]);
    })
  );

  log(`Created ${FILTER_TEST_EVENTS.length} filter test events`);
}

async function seed(): Promise<void> {
  await syncPermissions();
  log("Synced roles and permissions");

  await ensureExpenseCategories();
  await ensureWhatsAppGroup();

  let superAdminUserId = "";
  let volunteerUserId = "";
  await Promise.all(
    TEST_USERS.map(async (testUser) => {
      const userId = await ensureTestUser(testUser);
      await ensureBankAccount(userId);
      if (testUser.role === "super_admin") {
        superAdminUserId = userId;
      } else if (testUser.role === "volunteer") {
        volunteerUserId = userId;
      }
    })
  );

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
