import path from "node:path";
import { auth } from "@pi-dash/auth";
import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { bankAccount } from "@pi-dash/db/schema/bank-account";
import {
  eventFeedback,
  eventFeedbackSubmission,
} from "@pi-dash/db/schema/event-feedback";
import { eventInterest } from "@pi-dash/db/schema/event-interest";
import { eventPhoto } from "@pi-dash/db/schema/event-photo";
import { eventUpdate } from "@pi-dash/db/schema/event-update";
import { expenseCategory } from "@pi-dash/db/schema/expense-category";
import { role, rolePermission } from "@pi-dash/db/schema/permission";
import {
  reimbursement,
  reimbursementAttachment,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import {
  vendor,
  vendorPayment,
  vendorPaymentLineItem,
} from "@pi-dash/db/schema/vendor";
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
const SEED_UPCOMING_REIMBURSEMENT_ID = "e2e00000-0000-0000-0000-000000000002";
const SEED_VENDOR_ID = "e2e00000-0000-0000-0000-000000000003";
const SEED_VENDOR_PAYMENT_ID = "e2e00000-0000-0000-0000-000000000004";
const SEED_REIMBURSEMENT_ATTACHMENT_ID = "e2e00000-0000-0000-0000-000000000005";
const SEED_TEMP_REIMBURSEMENT_ATTACHMENT_ID =
  "e2e00000-0000-0000-0000-000000000006";
const ZERO_AUTH_PROTECTED_TEAM_ID = "e2e00000-0000-0000-0000-000000000101";
const ZERO_AUTH_LEAD_TEAM_ID = "e2e00000-0000-0000-0000-000000000102";
const ZERO_AUTH_PROTECTED_EVENT_ID = "e2e00000-0000-0000-0000-000000000201";
const ZERO_AUTH_LEAD_EVENT_ID = "e2e00000-0000-0000-0000-000000000202";
const ZERO_AUTH_PROTECTED_INTEREST_ID = "e2e00000-0000-0000-0000-000000000301";
const ZERO_AUTH_PROTECTED_UPDATE_ID = "e2e00000-0000-0000-0000-000000000302";
const ZERO_AUTH_PROTECTED_PHOTO_ID = "e2e00000-0000-0000-0000-000000000303";
const ZERO_AUTH_LEAD_FEEDBACK_ID = "e2e00000-0000-0000-0000-000000000304";
const ZERO_AUTH_LEAD_FEEDBACK_SUBMISSION_ID =
  "e2e00000-0000-0000-0000-000000000305";
const ZERO_AUTH_PROTECTED_FEEDBACK_ID = "e2e00000-0000-0000-0000-000000000306";
const ZERO_AUTH_PROTECTED_FEEDBACK_SUBMISSION_ID =
  "e2e00000-0000-0000-0000-000000000307";
const ZERO_AUTH_PROTECTED_ADMIN_MEMBER_ID =
  "e2e00000-0000-0000-0000-000000000401";
const ZERO_AUTH_PROTECTED_VOLUNTEER_MEMBER_ID =
  "e2e00000-0000-0000-0000-000000000402";
const ZERO_AUTH_LEAD_ADMIN_MEMBER_ID = "e2e00000-0000-0000-0000-000000000403";
const ZERO_AUTH_LEAD_VOLUNTEER_MEMBER_ID =
  "e2e00000-0000-0000-0000-000000000404";
const ZERO_AUTH_PROTECTED_ADMIN_EVENT_MEMBER_ID =
  "e2e00000-0000-0000-0000-000000000501";
const ZERO_AUTH_PROTECTED_VOLUNTEER_EVENT_MEMBER_ID =
  "e2e00000-0000-0000-0000-000000000502";
const ZERO_AUTH_LEAD_ADMIN_EVENT_MEMBER_ID =
  "e2e00000-0000-0000-0000-000000000503";
const ZERO_AUTH_LEAD_VOLUNTEER_EVENT_MEMBER_ID =
  "e2e00000-0000-0000-0000-000000000504";
const R2_KEY_PREFIX = process.env.R2_KEY_PREFIX ?? "attachments";
const LEGACY_CDN_URL = process.env.VITE_CDN_URL ?? "https://cdn.example.test";
const TRAILING_SLASH = /\/$/;
const ZERO_AUTH_EVENT_MEDIA_KEY = `${R2_KEY_PREFIX}/updates/${ZERO_AUTH_PROTECTED_EVENT_ID}/e2e-editor-image.jpg`;

const legacyMediaUrl = (key: string): string =>
  `${LEGACY_CDN_URL.replace(TRAILING_SLASH, "")}/${key}`;

const plateImageContent = (url: string): string =>
  JSON.stringify([
    {
      children: [{ text: "" }],
      type: "img",
      url,
    },
  ]);

async function ensureReimbursement(
  userId: string,
  eventId?: string
): Promise<void> {
  const existing = await db.query.reimbursement.findFirst({
    where: (table, ops) => ops.eq(table.id, SEED_REIMBURSEMENT_ID),
  });
  if (existing) {
    if (eventId && existing.eventId !== eventId) {
      await db
        .update(reimbursement)
        .set({ eventId })
        .where(eq(reimbursement.id, SEED_REIMBURSEMENT_ID));
    }
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
    eventId,
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

async function ensureUpcomingEventReimbursement(
  userId: string,
  eventId: string
): Promise<void> {
  const existing = await db.query.reimbursement.findFirst({
    where: (table, ops) => ops.eq(table.id, SEED_UPCOMING_REIMBURSEMENT_ID),
  });
  if (existing) {
    return;
  }

  const category = await db.query.expenseCategory.findFirst();
  if (!category) {
    log("Skipping upcoming event reimbursement seed — no categories found");
    return;
  }

  const now = new Date();
  await db.insert(reimbursement).values({
    city: "bangalore",
    createdAt: now,
    eventId,
    expenseDate: "2026-01-15",
    id: SEED_UPCOMING_REIMBURSEMENT_ID,
    status: "pending",
    title: "E2E Upcoming Event Reimbursement",
    updatedAt: now,
    userId,
  });

  await db.insert(reimbursementLineItem).values({
    amount: "275.00",
    categoryId: category.id,
    createdAt: now,
    description: "Upcoming event supplies",
    generateVoucher: true,
    id: uuidv7(),
    reimbursementId: SEED_UPCOMING_REIMBURSEMENT_ID,
    sortOrder: 0,
    updatedAt: now,
  });

  log("Created upcoming event reimbursement");
}

async function ensureR2AuthorizationFixtures(): Promise<void> {
  const now = new Date();
  await db
    .insert(reimbursementAttachment)
    .values([
      {
        createdAt: now,
        filename: "private-receipt.pdf",
        id: SEED_REIMBURSEMENT_ATTACHMENT_ID,
        mimeType: "application/pdf",
        objectKey: "legacy/e2e/private-receipt.pdf",
        reimbursementId: SEED_REIMBURSEMENT_ID,
        type: "file",
      },
      {
        createdAt: now,
        filename: "temporary-receipt.pdf",
        id: SEED_TEMP_REIMBURSEMENT_ATTACHMENT_ID,
        mimeType: "application/pdf",
        objectKey: "app/attachments/tmp/e2e/temporary-receipt.pdf",
        reimbursementId: SEED_REIMBURSEMENT_ID,
        type: "file",
      },
    ])
    .onConflictDoNothing();
}

async function ensureEventVendorPayment(
  userId: string,
  eventId: string
): Promise<void> {
  const existingVendor = await db.query.vendor.findFirst({
    where: (table, ops) => ops.eq(table.id, SEED_VENDOR_ID),
  });
  const now = new Date();

  const vendorId = existingVendor?.id ?? SEED_VENDOR_ID;
  if (!existingVendor) {
    await db.insert(vendor).values({
      bankAccountIfscCode: "TEST0000002",
      bankAccountName: "E2E Vendor Account",
      bankAccountNumber: "9876543210",
      contactPhone: "+919999999999",
      createdAt: now,
      createdBy: userId,
      id: SEED_VENDOR_ID,
      name: "E2E Event Vendor",
      status: "approved",
      updatedAt: now,
    });
  }

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
    city: "bangalore",
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
    amount: "625.00",
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

async function ensureZeroQueryAuthorizationFixtures(
  adminUserId: string,
  volunteerUserId: string
): Promise<void> {
  const now = new Date();
  const pastStart = subDays(now, 2);

  await db
    .update(user)
    .set({
      image: legacyMediaUrl(
        `${R2_KEY_PREFIX}/avatars/${volunteerUserId}/e2e-avatar.jpg`
      ),
    })
    .where(eq(user.id, volunteerUserId));

  await db
    .insert(team)
    .values([
      {
        createdAt: now,
        description: "Protected fixtures for Zero query authorization tests",
        id: ZERO_AUTH_PROTECTED_TEAM_ID,
        name: "E2E Zero Query Protected Team",
        updatedAt: now,
      },
      {
        createdAt: now,
        description: "Lead fixtures for Zero query authorization tests",
        id: ZERO_AUTH_LEAD_TEAM_ID,
        name: "E2E Zero Query Lead Team",
        updatedAt: now,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(teamMember)
    .values([
      {
        id: ZERO_AUTH_PROTECTED_ADMIN_MEMBER_ID,
        joinedAt: now,
        role: "lead",
        teamId: ZERO_AUTH_PROTECTED_TEAM_ID,
        userId: adminUserId,
      },
      {
        id: ZERO_AUTH_PROTECTED_VOLUNTEER_MEMBER_ID,
        joinedAt: now,
        role: "member",
        teamId: ZERO_AUTH_PROTECTED_TEAM_ID,
        userId: volunteerUserId,
      },
      {
        id: ZERO_AUTH_LEAD_ADMIN_MEMBER_ID,
        joinedAt: now,
        role: "member",
        teamId: ZERO_AUTH_LEAD_TEAM_ID,
        userId: adminUserId,
      },
      {
        id: ZERO_AUTH_LEAD_VOLUNTEER_MEMBER_ID,
        joinedAt: now,
        role: "lead",
        teamId: ZERO_AUTH_LEAD_TEAM_ID,
        userId: volunteerUserId,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(teamEvent)
    .values([
      {
        createdAt: now,
        createdBy: adminUserId,
        description:
          "Protected event for direct Zero query authorization tests",
        feedbackEnabled: true,
        id: ZERO_AUTH_PROTECTED_EVENT_ID,
        isPublic: false,
        name: "E2E Zero Query Protected Event",
        startTime: pastStart,
        teamId: ZERO_AUTH_PROTECTED_TEAM_ID,
        updatedAt: now,
      },
      {
        createdAt: now,
        createdBy: adminUserId,
        description: "Lead event for direct Zero query authorization tests",
        feedbackEnabled: true,
        id: ZERO_AUTH_LEAD_EVENT_ID,
        isPublic: true,
        name: "E2E Zero Query Lead Event",
        startTime: pastStart,
        teamId: ZERO_AUTH_LEAD_TEAM_ID,
        updatedAt: now,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(teamEventMember)
    .values([
      {
        addedAt: now,
        eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
        id: ZERO_AUTH_PROTECTED_ADMIN_EVENT_MEMBER_ID,
        userId: adminUserId,
      },
      {
        addedAt: now,
        eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
        id: ZERO_AUTH_PROTECTED_VOLUNTEER_EVENT_MEMBER_ID,
        userId: volunteerUserId,
      },
      {
        addedAt: now,
        eventId: ZERO_AUTH_LEAD_EVENT_ID,
        id: ZERO_AUTH_LEAD_ADMIN_EVENT_MEMBER_ID,
        userId: adminUserId,
      },
      {
        addedAt: now,
        eventId: ZERO_AUTH_LEAD_EVENT_ID,
        id: ZERO_AUTH_LEAD_VOLUNTEER_EVENT_MEMBER_ID,
        userId: volunteerUserId,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(eventInterest)
    .values({
      createdAt: now,
      eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
      id: ZERO_AUTH_PROTECTED_INTEREST_ID,
      message: "Protected interest fixture",
      status: "pending",
      userId: volunteerUserId,
    })
    .onConflictDoNothing();

  await db
    .insert(eventUpdate)
    .values({
      content: plateImageContent(legacyMediaUrl(ZERO_AUTH_EVENT_MEDIA_KEY)),
      createdAt: now,
      createdBy: volunteerUserId,
      eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
      id: ZERO_AUTH_PROTECTED_UPDATE_ID,
      status: "pending",
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(eventPhoto)
    .values({
      caption: "Protected pending photo fixture",
      createdAt: now,
      eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
      id: ZERO_AUTH_PROTECTED_PHOTO_ID,
      mimeType: "image/jpeg",
      r2Key: "e2e/zero-query-protected-photo.jpg",
      status: "pending",
      uploadedBy: volunteerUserId,
    })
    .onConflictDoNothing();

  await db
    .insert(eventFeedback)
    .values([
      {
        content: "Protected lead feedback fixture",
        createdAt: now,
        eventId: ZERO_AUTH_LEAD_EVENT_ID,
        id: ZERO_AUTH_LEAD_FEEDBACK_ID,
        updatedAt: now,
      },
      {
        content: "Protected participant feedback fixture",
        createdAt: now,
        eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
        id: ZERO_AUTH_PROTECTED_FEEDBACK_ID,
        updatedAt: now,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(eventFeedbackSubmission)
    .values([
      {
        eventId: ZERO_AUTH_LEAD_EVENT_ID,
        feedbackId: ZERO_AUTH_LEAD_FEEDBACK_ID,
        id: ZERO_AUTH_LEAD_FEEDBACK_SUBMISSION_ID,
        submittedAt: now,
        userId: adminUserId,
      },
      {
        eventId: ZERO_AUTH_PROTECTED_EVENT_ID,
        feedbackId: ZERO_AUTH_PROTECTED_FEEDBACK_ID,
        id: ZERO_AUTH_PROTECTED_FEEDBACK_SUBMISSION_ID,
        submittedAt: now,
        userId: adminUserId,
      },
    ])
    .onConflictDoNothing();

  log("Zero query authorization fixtures ready");
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
  await verifyReservedPermissionSync();
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

  const teamId = await ensureEventWithPendingUpdate(
    superAdminUserId,
    volunteerUserId
  );
  await ensureZeroQueryAuthorizationFixtures(superAdminUserId, volunteerUserId);
  await ensureFilterTestEvents(teamId, superAdminUserId, volunteerUserId);
  const pastEvent = await db.query.teamEvent.findFirst({
    where: (table, ops) => ops.eq(table.name, SEED_EVENT_NAME),
  });
  const upcomingEvent = await db.query.teamEvent.findFirst({
    where: (table, ops) => ops.eq(table.name, "E2E Upcoming Public Bangalore"),
  });
  if (!(pastEvent && upcomingEvent)) {
    throw new Error("E2E event expense fixtures require seeded events");
  }
  await ensureReimbursement(superAdminUserId, pastEvent.id);
  await ensureR2AuthorizationFixtures();
  await ensureEventVendorPayment(superAdminUserId, pastEvent.id);
  await ensureUpcomingEventReimbursement(superAdminUserId, upcomingEvent.id);
}

seed().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown error seeding test users";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
