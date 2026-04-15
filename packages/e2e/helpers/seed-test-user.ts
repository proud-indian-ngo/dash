import path from "node:path";
import { auth } from "@pi-dash/auth";
import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { bankAccount } from "@pi-dash/db/schema/bank-account";
import { center, centerCoordinator } from "@pi-dash/db/schema/center";
import { eventUpdate } from "@pi-dash/db/schema/event-update";
import { expenseCategory } from "@pi-dash/db/schema/expense-category";
import {
  reimbursement,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import { classEventStudent, student } from "@pi-dash/db/schema/student";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { syncPermissions } from "@pi-dash/db/sync-permissions";
import { subDays } from "date-fns";
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

interface TestUser {
  email: string;
  name: string;
  password: string;
  role: "super_admin" | "volunteer" | "center_coordinator";
}

const TEST_USERS: TestUser[] = [
  {
    email: process.env.ADMIN_EMAIL ?? "test-admin@pi-dash.test",
    password: process.env.ADMIN_PASSWORD ?? "TestAdmin123!",
    name: "Test Admin",
    role: "super_admin",
  },
  {
    email: process.env.VOLUNTEER_EMAIL ?? "test-volunteer@pi-dash.test",
    password: process.env.VOLUNTEER_PASSWORD ?? "TestVolunteer123!",
    name: "Test Volunteer",
    role: "center_coordinator",
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

const SEED_CENTER_NAME = "E2E Test Center";
const SEED_STUDENT_NAME_PREFIX = "E2E Student";

async function ensureEventWithPendingUpdate(
  adminUserId: string,
  volunteerUserId: string
): Promise<void> {
  // Check if team already exists
  const existingTeam = await db.query.team.findFirst({
    where: (table, ops) => ops.eq(table.name, SEED_TEAM_NAME),
  });
  if (existingTeam) {
    log("E2E Updates Team already exists — skipping");
    return;
  }

  const now = new Date();
  const yesterday = subDays(now, 1);

  // Create team
  const teamId = uuidv7();
  await db.insert(team).values({
    id: teamId,
    name: SEED_TEAM_NAME,
    description: "Team for E2E update approval tests",
    createdBy: adminUserId,
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
}

async function ensureCenterAndStudents(
  adminUserId: string,
  volunteerUserId: string
): Promise<void> {
  // Check if center already exists
  const existingCenter = await db.query.center.findFirst({
    where: (table, ops) => ops.eq(table.name, SEED_CENTER_NAME),
  });
  if (existingCenter) {
    log("E2E Test Center already exists — skipping");
    return;
  }

  const now = new Date();
  const centerId = uuidv7();

  // Create center
  await db.insert(center).values({
    id: centerId,
    name: SEED_CENTER_NAME,
    city: "bangalore",
    address: "123 Test Street, Bangalore",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  // Assign volunteer as coordinator
  await db.insert(centerCoordinator).values({
    id: uuidv7(),
    centerId,
    userId: volunteerUserId,
    assignedAt: now,
  });

  // Create 3 students
  const studentIds: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const studentId = uuidv7();
    studentIds.push(studentId);
    await db.insert(student).values({
      id: studentId,
      name: `${SEED_STUDENT_NAME_PREFIX} ${i}`,
      dateOfBirth: new Date(`201${i}-0${i + 2}-15`),
      gender: i % 2 === 0 ? "female" : "male",
      centerId,
      city: "bangalore",
      notes: null,
      isActive: true,
      createdBy: adminUserId,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Find the E2E team (or any team with admin as lead)
  const existingTeam = await db.query.team.findFirst({
    where: (table, ops) => ops.eq(table.name, SEED_TEAM_NAME),
  });

  if (existingTeam) {
    // Create a class event linked to the center
    const classEventId = uuidv7();
    await db.insert(teamEvent).values({
      id: classEventId,
      teamId: existingTeam.id,
      type: "class",
      name: "E2E Saturday Class",
      description: "E2E test class event",
      startTime: subDays(now, 1), // yesterday so attendance can be marked
      endTime: new Date(subDays(now, 1).getTime() + 2 * 3_600_000),
      isPublic: false,
      centerId,
      createdBy: adminUserId,
      createdAt: subDays(now, 3),
      updatedAt: subDays(now, 3),
    });

    // Add admin as event member
    await db.insert(teamEventMember).values({
      id: uuidv7(),
      eventId: classEventId,
      userId: adminUserId,
      addedAt: subDays(now, 3),
    });

    // Enroll students
    for (const studentId of studentIds) {
      await db.insert(classEventStudent).values({
        id: uuidv7(),
        eventId: classEventId,
        studentId,
        attendance: null,
        attendanceMarkedAt: null,
        attendanceMarkedBy: null,
      });
    }

    log("Created E2E center, 3 students, class event with enrollment");
  } else {
    log("Created E2E center and 3 students (no team found for class event)");
  }
}

async function seed(): Promise<void> {
  await syncPermissions();
  log("Synced roles and permissions");

  await ensureExpenseCategories();
  await ensureWhatsAppGroup();

  let adminUserId = "";
  let volunteerUserId = "";
  for (const testUser of TEST_USERS) {
    const userId = await ensureTestUser(testUser);
    await ensureBankAccount(userId);
    if (testUser.role === "super_admin") {
      adminUserId = userId;
    } else {
      volunteerUserId = userId;
    }
  }

  await ensureReimbursement(adminUserId);
  await ensureEventWithPendingUpdate(adminUserId, volunteerUserId);
  await ensureCenterAndStudents(adminUserId, volunteerUserId);
}

seed().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown error seeding test users";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
