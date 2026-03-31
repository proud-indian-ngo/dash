import path from "node:path";
import { auth } from "@pi-dash/auth";
import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { bankAccount } from "@pi-dash/db/schema/bank-account";
import { expenseCategory } from "@pi-dash/db/schema/expense-category";
import { syncPermissions } from "@pi-dash/db/sync-permissions";
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
  role: "super_admin" | "volunteer";
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
    role: "volunteer",
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

  if (testUser.role === "volunteer") {
    updates.attendedOrientation = true;
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

async function seed(): Promise<void> {
  await syncPermissions();
  log("Synced roles and permissions");

  await ensureExpenseCategories();

  for (const testUser of TEST_USERS) {
    const userId = await ensureTestUser(testUser);
    await ensureBankAccount(userId);
  }
}

seed().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown error seeding test users";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
