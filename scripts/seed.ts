/**
 * Comprehensive dev seed — covers all data models with realistic data.
 * Fully idempotent: safe to run multiple times without creating duplicates.
 *
 * Usage:
 *   bun run seed          (from repo root)
 *
 * Seeded tables:
 *   user, account (auto-created by auth.api.createUser), notificationTopicPreference,
 *   role, permission, rolePermission (via syncPermissions),
 *   appConfig, whatsappGroup,
 *   team, teamMember, teamEvent, teamEventMember,
 *   eventInterest, eventFeedback, eventFeedbackSubmission,
 *   eventPhoto, eventImmichAlbum, eventUpdate,
 *   expenseCategory, bankAccount,
 *   reimbursement, reimbursementLineItem, reimbursementAttachment, reimbursementHistory,
 *   advancePayment, advancePaymentLineItem, advancePaymentAttachment, advancePaymentHistory,
 *   vendor, vendorPayment, vendorPaymentLineItem, vendorPaymentAttachment, vendorPaymentHistory,
 *   vendorPaymentTransaction, vendorPaymentTransactionAttachment, vendorPaymentTransactionHistory,
 *   scheduledMessage, scheduledMessageRecipient
 */

import { auth } from "@pi-dash/auth";
import { db } from "@pi-dash/db";
import {
  advancePayment,
  advancePaymentAttachment,
  advancePaymentHistory,
  advancePaymentLineItem,
} from "@pi-dash/db/schema/advance-payment";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { notificationTopicPreference, user } from "@pi-dash/db/schema/auth";
import { bankAccount } from "@pi-dash/db/schema/bank-account";
import {
  eventFeedback,
  eventFeedbackSubmission,
} from "@pi-dash/db/schema/event-feedback";
import { eventInterest } from "@pi-dash/db/schema/event-interest";
import { eventImmichAlbum, eventPhoto } from "@pi-dash/db/schema/event-photo";
import { eventReminderSent } from "@pi-dash/db/schema/event-reminder";
import { eventUpdate } from "@pi-dash/db/schema/event-update";
import { expenseCategory } from "@pi-dash/db/schema/expense-category";
import {
  reimbursement,
  reimbursementAttachment,
  reimbursementHistory,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import {
  scheduledMessage,
  scheduledMessageRecipient,
} from "@pi-dash/db/schema/scheduled-message";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import {
  vendor,
  vendorPayment,
  vendorPaymentAttachment,
  vendorPaymentHistory,
  vendorPaymentLineItem,
} from "@pi-dash/db/schema/vendor";
import {
  vendorPaymentTransaction,
  vendorPaymentTransactionAttachment,
  vendorPaymentTransactionHistory,
} from "@pi-dash/db/schema/vendor-payment-transaction";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { syncPermissions } from "@pi-dash/db/sync-permissions";
import { eq, sql } from "drizzle-orm";

// ── Helpers ──────────────────────────────────────────────────────────────────

const log = (msg: string) => process.stdout.write(`  ${msg}\n`);
const now = new Date();

function past(days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}
function future(days: number): Date {
  return new Date(now.getTime() + days * 86_400_000);
}
function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}
function subDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86_400_000);
}

function getUser(userMap: Map<string, string>, email: string): string {
  const id = userMap.get(email);
  if (!id) {
    throw new Error(`User not found: ${email}`);
  }
  return id;
}

// ── Deterministic IDs ────────────────────────────────────────────────────────

const ID = {
  // WhatsApp groups
  waTeaching: "019d52c2-7260-7d08-8a7b-fdd8adb38030",
  waKitchen: "019d52c2-7260-7d08-8a7b-fdd955064aa7",
  waCoordinators: "019d52c2-7260-7d08-8a7b-fdda671bc0c6",
  waWeekend: "019d52c2-7260-7d08-8a7b-fddb082a270e",
  // Teams
  teamTeaching: "019d52c2-7260-7d08-8a7b-fddcf9468d71",
  teamKitchen: "019d52c2-7261-7dce-b0ee-e205272f7c93",
  teamEvents: "019d52c2-7261-7dce-b0ee-e206561715b9",
  teamLogistics: "019d52c2-7261-7dce-b0ee-e20775aad61e",
  // Team members
  tm01: "019d52c2-7261-7dce-b0ee-e20844668f8b",
  tm02: "019d52c2-7261-7dce-b0ee-e2097f379d79",
  tm03: "019d52c2-7261-7dce-b0ee-e20a2e9d9d51",
  tm04: "019d52c2-7261-7dce-b0ee-e20bdc5ee142",
  tm05: "019d52c2-7261-7dce-b0ee-e20c834326ec",
  tm06: "019d52c2-7261-7dce-b0ee-e20dd6d764d2",
  tm07: "019d52c2-7261-7dce-b0ee-e20e520803fc",
  tm08: "019d52c2-7261-7dce-b0ee-e20ff7775df9",
  tm09: "019d52c2-7261-7dce-b0ee-e2106d3c0a4b",
  tm10: "019d52c2-7261-7dce-b0ee-e21164ef1b10",
  tm11: "019d52c2-7261-7dce-b0ee-e212a17b71e0",
  tm12: "019d52c2-7261-7dce-b0ee-e213c99ec89b",
  // Events
  evTeaching: "019d52c2-7261-7dce-b0ee-e2143101d41f",
  evTeachingNext: "019d52c2-7261-7dce-b0ee-e215aeea8546",
  evKitchen: "019d52c2-7261-7dce-b0ee-e216e531c68d",
  evOutreach: "019d52c2-7261-7dce-b0ee-e217bda25bc8",
  evPlanning: "019d52c2-7261-7dce-b0ee-e2182d2e359e",
  evSupply: "019d52c2-7261-7dce-b0ee-e219e08de6fd",
  // Event extras
  eiOutreachV3: "019d52c2-7261-7dce-b0ee-e21a61d64779",
  eiOutreachV4: "019d52c2-7261-7dce-b0ee-e21ba52dd57b",
  efTeaching: "019d52c2-7261-7dce-b0ee-e21c9eb9ef2f",
  efsTeachingV3: "019d52c2-7261-7dce-b0ee-e21d5ea9516c",
  epTeaching1: "019d52c2-7261-7dce-b0ee-e21ea1a161f6",
  epTeaching2: "019d52c2-7261-7dce-b0ee-e21f8e48bc04",
  eiaTeaching: "019d52c2-7261-7dce-b0ee-e220a48dfee3",
  eiaPlanning: "019d52c2-7261-7dce-b0ee-e221103892e4",
  euPlanning: "019d52c2-7261-7dce-b0ee-e2221e6385fa",
  euOutreach: "019d52c2-7261-7dce-b0ee-e223abc37f66",
  // Event reminders sent
  ers01: "019d52c2-7261-7dce-b0ee-e260a1b2c3d4",
  ers02: "019d52c2-7261-7dce-b0ee-e261b2c3d4e5",
  // Expense categories
  catTravel: "019d52c2-7261-7dce-b0ee-e2240bbad6ff",
  catFood: "019d52c2-7261-7dce-b0ee-e2250fe72d32",
  catAccom: "019d52c2-7261-7dce-b0ee-e2264856a924",
  catSupplies: "019d52c2-7261-7dce-b0ee-e2274dee1771",
  catPrinting: "019d52c2-7261-7dce-b0ee-e228caa3857f",
  catVenue: "019d52c2-7261-7dce-b0ee-e22961d6c773",
  catEquipment: "019d52c2-7261-7dce-b0ee-e22a02404b34",
  catMisc: "019d52c2-7261-7dce-b0ee-e22b65aa7b15",
  // Bank accounts
  ba01: "019d52c2-7261-7dce-b0ee-e22c3629534f",
  ba02: "019d52c2-7261-7dce-b0ee-e22de4d2f683",
  ba03: "019d52c2-7261-7dce-b0ee-e22ec1a7e2e5",
  ba04: "019d52c2-7261-7dce-b0ee-e22fe64b07bc",
  ba05: "019d52c2-7261-7dce-b0ee-e23031bee77c",
  ba06: "019d52c2-7261-7dce-b0ee-e231ffdfea4d",
  // Reimbursements
  reimb01: "019d52c2-7261-7dce-b0ee-e2321e761b1b",
  reimb02: "019d52c2-7261-7dce-b0ee-e23376d48e70",
  reimb03: "019d52c2-7261-7dce-b0ee-e234b5afd298",
  reimb04: "019d52c2-7261-7dce-b0ee-e235d60fa4f1",
  rli01: "019d52c2-7261-7dce-b0ee-e236266cd1d5",
  rli02: "019d52c2-7261-7dce-b0ee-e237e81528f0",
  rli03: "019d52c2-7261-7dce-b0ee-e23847f8fe38",
  rli04: "019d52c2-7261-7dce-b0ee-e2391b743da4",
  rli05: "019d52c2-7261-7dce-b0ee-e23a1adb4ff4",
  rli06: "019d52c2-7261-7dce-b0ee-e23b2c6aa7af",
  ra01: "019d52c2-7261-7dce-b0ee-e23c364fad5e",
  ra02: "019d52c2-7261-7dce-b0ee-e23d74ae80a5",
  rh01: "019d52c2-7261-7dce-b0ee-e23ed133ba5e",
  rh02: "019d52c2-7261-7dce-b0ee-e23ffa230e15",
  rh03: "019d52c2-7261-7dce-b0ee-e2400dfa4b1d",
  rh04: "019d52c2-7261-7dce-b0ee-e24179eafe07",
  rh05: "019d52c2-7261-7dce-b0ee-e242d948d519",
  rh06: "019d52c2-7261-7dce-b0ee-e24341d099cb",
  rh07: "019d52c2-7261-7dce-b0ee-e2441bdffc0e",
  rh08: "019d52c2-7261-7dce-b0ee-e24565289429",
  // Advance payments
  adv01: "019d52c2-7261-7dce-b0ee-e24661a8986a",
  advLi01: "019d52c2-7261-7dce-b0ee-e247832746fc",
  advLi02: "019d52c2-7261-7dce-b0ee-e248ba3fa109",
  advA01: "019d52c2-7261-7dce-b0ee-e2496c35ca3e",
  advH01: "019d52c2-7261-7dce-b0ee-e24af4242ec9",
  advH02: "019d52c2-7261-7dce-b0ee-e24b84bd3e7e",
  advH03: "019d52c2-7261-7dce-b0ee-e24ccaf3bcb2",
} as const;

// Second batch of IDs for vendors, scheduled messages, etc.
const ID2 = {
  // Vendors
  vendor01: "019d52c3-0000-7000-8000-000000000001",
  vendor02: "019d52c3-0000-7000-8000-000000000002",
  vp01: "019d52c3-0000-7000-8000-000000000003",
  vp02: "019d52c3-0000-7000-8000-000000000004",
  vpLi01: "019d52c3-0000-7000-8000-000000000005",
  vpLi02: "019d52c3-0000-7000-8000-000000000006",
  vpLi03: "019d52c3-0000-7000-8000-000000000007",
  vpA01: "019d52c3-0000-7000-8000-000000000008",
  vpA02: "019d52c3-0000-7000-8000-000000000009",
  vpH01: "019d52c3-0000-7000-8000-00000000000a",
  vpH02: "019d52c3-0000-7000-8000-00000000000b",
  vpH03: "019d52c3-0000-7000-8000-00000000000c",
  vpH04: "019d52c3-0000-7000-8000-00000000000d",
  vpH05: "019d52c3-0000-7000-8000-00000000000e",
  // Vendor payment transaction
  vpt01: "019d52c3-0000-7000-8000-00000000000f",
  vptA01: "019d52c3-0000-7000-8000-000000000010",
  vptH01: "019d52c3-0000-7000-8000-000000000011",
  vptH02: "019d52c3-0000-7000-8000-000000000012",
  // Scheduled messages
  sm01: "019d52c3-0000-7000-8000-000000000013",
  sm02: "019d52c3-0000-7000-8000-000000000014",
  sm03: "019d52c3-0000-7000-8000-000000000015",
  smr01: "019d52c3-0000-7000-8000-000000000016",
  smr02: "019d52c3-0000-7000-8000-000000000017",
  smr03: "019d52c3-0000-7000-8000-000000000018",
  smr04: "019d52c3-0000-7000-8000-000000000019",
  smr05: "019d52c3-0000-7000-8000-00000000001a",
  smr06: "019d52c3-0000-7000-8000-00000000001b",
  smr07: "019d52c3-0000-7000-8000-00000000001c",
} as const;

// ── User definitions ─────────────────────────────────────────────────────────

interface SeedUser {
  email: string;
  gender?: "male" | "female";
  name: string;
  password: string;
  phone?: string;
  role: string;
}

const USERS: SeedUser[] = [
  {
    email: "admin@pi-dash.dev",
    name: "Dev Admin",
    password: "Admin123!",
    role: "super_admin",
    gender: "male",
    phone: "+919876543210",
  },
  {
    email: "lead@pi-dash.dev",
    name: "Priya Sharma",
    password: "Lead123!",
    role: "admin",
    gender: "female",
    phone: "+919876543211",
  },
  {
    email: "finance@pi-dash.dev",
    name: "Sneha Gupta",
    password: "Finance123!",
    role: "finance_admin",
    gender: "female",
    phone: "+919876543217",
  },
  {
    email: "volunteer1@pi-dash.dev",
    name: "Rahul Verma",
    password: "Volunteer123!",
    role: "volunteer",
    gender: "male",
    phone: "+919876543212",
  },
  {
    email: "volunteer2@pi-dash.dev",
    name: "Ananya Patel",
    password: "Volunteer123!",
    role: "volunteer",
    gender: "female",
    phone: "+919876543213",
  },
  {
    email: "volunteer3@pi-dash.dev",
    name: "Vikram Singh",
    password: "Volunteer123!",
    role: "volunteer",
    gender: "male",
    phone: "+919876543214",
  },
  {
    email: "newbie@pi-dash.dev",
    name: "Arjun Nair",
    password: "Newbie123!",
    role: "unoriented_volunteer",
    gender: "male",
    phone: "+919876543216",
  },
];

// ── 1. Users ─────────────────────────────────────────────────────────────────

async function seedUsers(): Promise<Map<string, string>> {
  log("Seeding users...");
  const userMap = new Map<string, string>();

  for (const u of USERS) {
    let record = await db.query.user.findFirst({
      columns: { id: true },
      where: (t, ops) => ops.eq(t.email, u.email),
    });

    if (!record) {
      await auth.api.createUser({
        body: { email: u.email, name: u.name, password: u.password },
      });
      record = await db.query.user.findFirst({
        columns: { id: true },
        where: (t, ops) => ops.eq(t.email, u.email),
      });
    }

    if (!record) {
      throw new Error(`Failed to create user: ${u.email}`);
    }

    await db
      .update(user)
      .set({
        role: u.role,
        emailVerified: true,
        gender: u.gender,
        phone: u.phone,
        isOnWhatsapp: true,
        isActive: true,
      })
      .where(eq(user.id, record.id));

    userMap.set(u.email, record.id);
  }

  log(`${userMap.size} users ready`);
  return userMap;
}

// ── 2. Expense Categories ────────────────────────────────────────────────────

const CATEGORIES = [
  {
    id: ID.catTravel,
    name: "Travel",
    description: "Transportation and commute expenses",
  },
  { id: ID.catFood, name: "Food", description: "Meals and refreshments" },
  { id: ID.catAccom, name: "Accommodation", description: "Hotel and lodging" },
  {
    id: ID.catSupplies,
    name: "Supplies",
    description: "Office and event supplies",
  },
  {
    id: ID.catPrinting,
    name: "Printing",
    description: "Banners, flyers, and print material",
  },
  {
    id: ID.catVenue,
    name: "Venue",
    description: "Venue rental and booking charges",
  },
  {
    id: ID.catEquipment,
    name: "Equipment",
    description: "Equipment rental and purchase",
  },
  {
    id: ID.catMisc,
    name: "Miscellaneous",
    description: "Other uncategorized expenses",
  },
];

async function seedCategories(): Promise<void> {
  log("Seeding expense categories...");
  await db
    .insert(expenseCategory)
    .values(
      CATEGORIES.map((cat) => ({ ...cat, createdAt: now, updatedAt: now }))
    )
    .onConflictDoNothing();
  log(`${CATEGORIES.length} categories ready`);
}

// ── 3. Bank Accounts ─────────────────────────────────────────────────────────

async function seedBankAccounts(userMap: Map<string, string>): Promise<void> {
  log("Seeding bank accounts...");
  const accounts = [
    {
      id: ID.ba01,
      email: "admin@pi-dash.dev",
      name: "Dev Admin Savings",
      num: "1001200034005600",
      ifsc: "SBIN0001234",
    },
    {
      id: ID.ba02,
      email: "lead@pi-dash.dev",
      name: "Priya Savings",
      num: "2001200034005601",
      ifsc: "HDFC0002345",
    },
    {
      id: ID.ba03,
      email: "volunteer1@pi-dash.dev",
      name: "Rahul Savings",
      num: "3001200034005602",
      ifsc: "ICIC0003456",
    },
    {
      id: ID.ba04,
      email: "volunteer2@pi-dash.dev",
      name: "Ananya Savings",
      num: "4001200034005603",
      ifsc: "AXIS0004567",
    },
    {
      id: ID.ba05,
      email: "volunteer3@pi-dash.dev",
      name: "Vikram Salary",
      num: "5001200034005604",
      ifsc: "UTIB0005678",
    },
    {
      id: ID.ba06,
      email: "finance@pi-dash.dev",
      name: "Sneha Current",
      num: "6001200034005605",
      ifsc: "KKBK0006789",
    },
  ];

  const rows = accounts
    .map((a) => {
      const userId = userMap.get(a.email);
      if (!userId) {
        return null;
      }
      return {
        id: a.id,
        userId,
        accountName: a.name,
        accountNumber: a.num,
        ifscCode: a.ifsc,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length > 0) {
    await db.insert(bankAccount).values(rows).onConflictDoNothing();
  }
  log(`${rows.length} bank accounts ready`);
}

// ── 4. WhatsApp Groups ───────────────────────────────────────────────────────

const WA_GROUPS = [
  { id: ID.waTeaching, name: "Teaching Team", jid: "120363001234567890@g.us" },
  { id: ID.waKitchen, name: "Kitchen Duty", jid: "120363002345678901@g.us" },
  {
    id: ID.waCoordinators,
    name: "Event Coordinators",
    jid: "120363003456789012@g.us",
  },
  { id: ID.waWeekend, name: "Weekend Seva", jid: "120363004567890123@g.us" },
];

async function seedWhatsappGroups(): Promise<void> {
  log("Seeding WhatsApp groups...");
  await db
    .insert(whatsappGroup)
    .values(WA_GROUPS.map((g) => ({ ...g, createdAt: now, updatedAt: now })))
    .onConflictDoNothing();
  log(`${WA_GROUPS.length} WhatsApp groups ready`);
}

// ── 5. Teams + Members ───────────────────────────────────────────────────────

async function seedTeams(userMap: Map<string, string>): Promise<void> {
  log("Seeding teams...");
  const adminId = getUser(userMap, "admin@pi-dash.dev");
  const leadId = getUser(userMap, "lead@pi-dash.dev");
  const v1 = getUser(userMap, "volunteer1@pi-dash.dev");
  const v2 = getUser(userMap, "volunteer2@pi-dash.dev");
  const v3 = getUser(userMap, "volunteer3@pi-dash.dev");

  const teams = [
    {
      id: ID.teamTeaching,
      name: "Teaching",
      waId: ID.waTeaching,
      members: [
        { id: ID.tm01, uid: leadId, role: "lead" as const },
        { id: ID.tm02, uid: v1, role: "member" as const },
        { id: ID.tm03, uid: v2, role: "member" as const },
      ],
    },
    {
      id: ID.teamKitchen,
      name: "Kitchen",
      waId: ID.waKitchen,
      members: [
        { id: ID.tm04, uid: v3, role: "lead" as const },
        { id: ID.tm05, uid: v1, role: "member" as const },
      ],
    },
    {
      id: ID.teamEvents,
      name: "Events & Outreach",
      waId: ID.waCoordinators,
      members: [
        { id: ID.tm06, uid: adminId, role: "lead" as const },
        { id: ID.tm07, uid: leadId, role: "member" as const },
        { id: ID.tm08, uid: v2, role: "member" as const },
        { id: ID.tm09, uid: v3, role: "member" as const },
      ],
    },
    {
      id: ID.teamLogistics,
      name: "Logistics",
      waId: null,
      members: [
        { id: ID.tm10, uid: v1, role: "lead" as const },
        { id: ID.tm11, uid: v2, role: "member" as const },
        { id: ID.tm12, uid: v3, role: "member" as const },
      ],
    },
  ];

  for (const t of teams) {
    await db
      .insert(team)
      .values({
        id: t.id,
        name: t.name,
        description: `The ${t.name} team`,
        whatsappGroupId: t.waId ?? undefined,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    for (const m of t.members) {
      await db
        .insert(teamMember)
        .values({
          id: m.id,
          teamId: t.id,
          userId: m.uid,
          role: m.role,
          joinedAt: past(30),
        })
        .onConflictDoNothing();
    }
  }
  log(`${teams.length} teams ready`);
}

// ── 6. Events + Members ──────────────────────────────────────────────────────

async function seedEvents(userMap: Map<string, string>): Promise<void> {
  log("Seeding events...");
  const adminId = getUser(userMap, "admin@pi-dash.dev");
  const leadId = getUser(userMap, "lead@pi-dash.dev");
  const v1 = getUser(userMap, "volunteer1@pi-dash.dev");
  const v2 = getUser(userMap, "volunteer2@pi-dash.dev");
  const v3 = getUser(userMap, "volunteer3@pi-dash.dev");

  const events = [
    {
      id: ID.evTeaching,
      teamId: ID.teamTeaching,
      name: "Weekly Teaching Session",
      start: past(7),
      end: addHours(past(7), 2),
      isPublic: true,
      creator: leadId,
      feedbackEnabled: true,
      location: "Bangalore Community Hall",
      members: [leadId, v1, v2],
    },
    {
      id: ID.evTeachingNext,
      teamId: ID.teamTeaching,
      name: "Upcoming Teaching Session",
      start: future(2),
      end: addHours(future(2), 2),
      isPublic: true,
      creator: leadId,
      location: "Bangalore Community Hall",
      members: [leadId, v1],
    },
    {
      id: ID.evKitchen,
      teamId: ID.teamKitchen,
      name: "Kitchen Prep Day",
      start: past(3),
      end: addHours(past(3), 4),
      isPublic: false,
      creator: v3,
      location: "Main Kitchen",
      members: [v3, v1],
    },
    {
      id: ID.evOutreach,
      teamId: ID.teamEvents,
      name: "Community Outreach Drive",
      start: future(7),
      end: addHours(future(7), 6),
      isPublic: true,
      creator: adminId,
      feedbackEnabled: true,
      location: "Cubbon Park, Bangalore",
      members: [adminId, leadId, v2],
      reminderIntervals: [4320, 1440, 120],
    },
    {
      id: ID.evPlanning,
      teamId: ID.teamEvents,
      name: "Monthly Planning Meeting",
      start: past(14),
      end: addHours(past(14), 1),
      isPublic: false,
      creator: adminId,
      location: "Office Conference Room",
      members: [adminId, leadId, v3],
    },
    {
      id: ID.evSupply,
      teamId: ID.teamLogistics,
      name: "Supply Run",
      start: future(1),
      end: addHours(future(1), 3),
      isPublic: false,
      creator: v1,
      location: "Wholesale Market",
      members: [v1, v2],
      reminderIntervals: [1440, 120],
    },
  ];

  for (const e of events) {
    await db
      .insert(teamEvent)
      .values({
        id: e.id,
        teamId: e.teamId,
        name: e.name,
        description: `${e.name} — organized by the team`,
        location: e.location,
        startTime: e.start,
        endTime: e.end,
        isPublic: e.isPublic,
        feedbackEnabled: e.feedbackEnabled ?? false,
        feedbackDeadline: e.feedbackEnabled ? future(3) : undefined,
        reminderIntervals: e.reminderIntervals ?? null,
        createdBy: e.creator,
        createdAt: subDays(e.start, 5),
        updatedAt: subDays(e.start, 5),
      })
      .onConflictDoNothing();

    const isPast = e.start < now;
    for (const uid of e.members) {
      if (isPast) {
        await db.execute(sql`
          INSERT INTO team_event_member (id, event_id, user_id, added_at, attendance, attendance_marked_at, attendance_marked_by)
          VALUES (gen_random_uuid(), ${e.id}, ${uid}, ${subDays(e.start, 3).toISOString()},
            'present'::attendance_status, ${e.end.toISOString()}, ${e.creator})
          ON CONFLICT (event_id, user_id) DO NOTHING
        `);
      } else {
        await db.execute(sql`
          INSERT INTO team_event_member (id, event_id, user_id, added_at)
          VALUES (gen_random_uuid(), ${e.id}, ${uid}, ${past(3).toISOString()})
          ON CONFLICT (event_id, user_id) DO NOTHING
        `);
      }
    }
  }
  log(`${events.length} events ready`);
}

// ── 7. Event Extras ──────────────────────────────────────────────────────────

async function seedEventExtras(userMap: Map<string, string>): Promise<void> {
  log("Seeding event extras...");
  const adminId = getUser(userMap, "admin@pi-dash.dev");
  const leadId = getUser(userMap, "lead@pi-dash.dev");
  const v3 = getUser(userMap, "volunteer3@pi-dash.dev");

  // Event interests
  await db
    .insert(eventInterest)
    .values({
      id: ID.eiOutreachV3,
      eventId: ID.evOutreach,
      userId: v3,
      status: "approved",
      message: "I'd love to help with the outreach drive!",
      reviewedBy: adminId,
      reviewedAt: now,
      createdAt: past(5),
    })
    .onConflictDoNothing();
  await db
    .insert(eventInterest)
    .values({
      id: ID.eiOutreachV4,
      eventId: ID.evOutreach,
      userId: getUser(userMap, "newbie@pi-dash.dev"),
      status: "pending",
      message: "Can I join as a photographer?",
      createdAt: past(2),
    })
    .onConflictDoNothing();

  // Feedback
  await db
    .insert(eventFeedback)
    .values({
      id: ID.efTeaching,
      eventId: ID.evTeaching,
      content:
        "Great session! The kids were very engaged. Could use more art supplies next time.",
      createdAt: past(5),
      updatedAt: past(5),
    })
    .onConflictDoNothing();

  // Feedback submission
  await db
    .insert(eventFeedbackSubmission)
    .values({
      id: ID.efsTeachingV3,
      eventId: ID.evTeaching,
      userId: v3,
      feedbackId: ID.efTeaching,
      submittedAt: past(5),
    })
    .onConflictDoNothing();

  // Photos
  await db
    .insert(eventPhoto)
    .values({
      id: ID.epTeaching1,
      eventId: ID.evTeaching,
      r2Key: "dev/events/teaching-01.jpg",
      caption: "Kids during the drawing activity",
      status: "approved",
      uploadedBy: leadId,
      reviewedBy: adminId,
      reviewedAt: past(5),
      createdAt: past(6),
    })
    .onConflictDoNothing();
  await db
    .insert(eventPhoto)
    .values({
      id: ID.epTeaching2,
      eventId: ID.evTeaching,
      r2Key: "dev/events/teaching-02.jpg",
      caption: "Group photo at the end",
      status: "pending",
      uploadedBy: v3,
      createdAt: past(5),
    })
    .onConflictDoNothing();

  // Immich albums
  await db
    .insert(eventImmichAlbum)
    .values({
      id: ID.eiaTeaching,
      eventId: ID.evTeaching,
      immichAlbumId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      createdAt: past(5),
    })
    .onConflictDoNothing();
  await db
    .insert(eventImmichAlbum)
    .values({
      id: ID.eiaPlanning,
      eventId: ID.evPlanning,
      immichAlbumId: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      createdAt: past(12),
    })
    .onConflictDoNothing();

  // Event updates
  await db
    .insert(eventUpdate)
    .values({
      id: ID.euPlanning,
      eventId: ID.evPlanning,
      content:
        "Meeting minutes: discussed Q2 goals, budget allocation, and volunteer recruitment targets.",
      createdBy: adminId,
      createdAt: past(13),
      updatedAt: past(13),
    })
    .onConflictDoNothing();
  await db
    .insert(eventUpdate)
    .values({
      id: ID.euOutreach,
      eventId: ID.evOutreach,
      content:
        "Reminder: please bring water bottles and sunscreen. We'll meet at the park entrance at 8 AM.",
      createdBy: adminId,
      createdAt: past(1),
      updatedAt: past(1),
    })
    .onConflictDoNothing();

  // Event reminder tracking (past events that already had reminders sent)
  await db
    .insert(eventReminderSent)
    .values({
      id: ID.ers01,
      eventId: ID.evTeaching,
      instanceDate: null,
      intervalMinutes: 1440,
      sentAt: subDays(past(7), 1),
    })
    .onConflictDoNothing();
  await db
    .insert(eventReminderSent)
    .values({
      id: ID.ers02,
      eventId: ID.evTeaching,
      instanceDate: null,
      intervalMinutes: 120,
      sentAt: addHours(subDays(past(7), 0), -2),
    })
    .onConflictDoNothing();

  log("Event extras seeded");
}

// ── 8. Reimbursements ────────────────────────────────────────────────────────

async function seedReimbursements(userMap: Map<string, string>): Promise<void> {
  log("Seeding reimbursements...");
  const adminId = getUser(userMap, "admin@pi-dash.dev");
  const v1 = getUser(userMap, "volunteer1@pi-dash.dev");
  const v2 = getUser(userMap, "volunteer2@pi-dash.dev");
  const leadId = getUser(userMap, "lead@pi-dash.dev");

  const reimbursements = [
    {
      id: ID.reimb01,
      userId: v1,
      title: "Bus fare for teaching sessions (March)",
      city: "bangalore" as const,
      status: "approved" as const,
      expenseDate: past(10),
      reviewedBy: adminId,
      items: [
        {
          id: ID.rli01,
          cat: ID.catTravel,
          desc: "Bus pass - monthly",
          amount: "1500.00",
        },
        {
          id: ID.rli02,
          cat: ID.catFood,
          desc: "Snacks for kids",
          amount: "450.00",
        },
      ],
      historyIds: [ID.rh01, ID.rh02, ID.rh03],
    },
    {
      id: ID.reimb02,
      userId: v2,
      title: "Art supplies purchase",
      city: "bangalore" as const,
      status: "pending" as const,
      expenseDate: past(5),
      items: [
        {
          id: ID.rli03,
          cat: ID.catSupplies,
          desc: "Crayons and sketch pads",
          amount: "2200.00",
        },
        {
          id: ID.rli04,
          cat: ID.catSupplies,
          desc: "Chart papers",
          amount: "350.00",
        },
      ],
      historyIds: [ID.rh04, ID.rh05],
    },
    {
      id: ID.reimb03,
      userId: leadId,
      title: "Venue booking deposit",
      city: "mumbai" as const,
      status: "pending" as const,
      expenseDate: past(2),
      items: [
        {
          id: ID.rli05,
          cat: ID.catVenue,
          desc: "Community hall deposit",
          amount: "5000.00",
        },
      ],
      historyIds: [ID.rh06],
    },
    {
      id: ID.reimb04,
      userId: v1,
      title: "Auto fare for supply pickup",
      city: "bangalore" as const,
      status: "rejected" as const,
      expenseDate: past(20),
      reviewedBy: adminId,
      rejectionReason: "Please submit with receipt",
      items: [
        {
          id: ID.rli06,
          cat: ID.catTravel,
          desc: "Auto to wholesale market",
          amount: "300.00",
        },
      ],
      historyIds: [ID.rh07, ID.rh08],
    },
  ];

  for (const r of reimbursements) {
    await db
      .insert(reimbursement)
      .values({
        id: r.id,
        userId: r.userId,
        title: r.title,
        city: r.city,
        expenseDate: r.expenseDate.toISOString().slice(0, 10),
        status: r.status,
        rejectionReason: r.rejectionReason ?? null,
        bankAccountName: "Savings Account",
        bankAccountNumber: "1234567890",
        bankAccountIfscCode: "SBIN0001234",
        reviewedBy: r.reviewedBy ?? null,
        reviewedAt: r.reviewedBy ? past(1) : null,
        submittedAt: subDays(r.expenseDate, 1),
        createdAt: subDays(r.expenseDate, 2),
        updatedAt: now,
      })
      .onConflictDoNothing();

    for (const [i, item] of r.items.entries()) {
      await db
        .insert(reimbursementLineItem)
        .values({
          id: item.id,
          reimbursementId: r.id,
          categoryId: item.cat,
          description: item.desc,
          amount: item.amount,
          sortOrder: i,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
    }

    // History entries
    interface HistoryEntry {
      action: "created" | "submitted" | "approved" | "rejected";
      actorId: string;
      createdAt: Date;
      id: string;
      note?: string;
    }
    const firstHistoryId = r.historyIds[0];
    if (!firstHistoryId) {
      continue;
    }
    const historyEntries: HistoryEntry[] = [
      {
        id: firstHistoryId,
        action: "created",
        actorId: r.userId,
        createdAt: subDays(r.expenseDate, 2),
      },
    ];

    if (r.historyIds[1]) {
      historyEntries.push({
        id: r.historyIds[1],
        action: "submitted",
        actorId: r.userId,
        createdAt: subDays(r.expenseDate, 1),
      });
    }

    if (
      (r.status === "approved" || r.status === "rejected") &&
      r.reviewedBy &&
      r.historyIds[2]
    ) {
      historyEntries.push({
        id: r.historyIds[2],
        action: r.status,
        actorId: r.reviewedBy,
        note: r.rejectionReason,
        createdAt: past(1),
      });
    }

    for (const h of historyEntries) {
      await db
        .insert(reimbursementHistory)
        .values({
          id: h.id,
          reimbursementId: r.id,
          actorId: h.actorId,
          action: h.action,
          note: h.note,
          createdAt: h.createdAt,
        })
        .onConflictDoNothing();
    }
  }

  // Attachments
  await db
    .insert(reimbursementAttachment)
    .values({
      id: ID.ra01,
      reimbursementId: ID.reimb01,
      type: "file",
      filename: "bus-pass-receipt.pdf",
      objectKey: "dev/reimbursements/bus-pass-receipt.pdf",
      mimeType: "application/pdf",
      createdAt: past(9),
    })
    .onConflictDoNothing();
  await db
    .insert(reimbursementAttachment)
    .values({
      id: ID.ra02,
      reimbursementId: ID.reimb01,
      type: "url",
      url: "https://example.com/receipt-verification/12345",
      filename: "Online receipt link",
      createdAt: past(9),
    })
    .onConflictDoNothing();

  log(`${reimbursements.length} reimbursements seeded`);
}

// ── 9. Advance Payments ──────────────────────────────────────────────────────

async function seedAdvancePayments(
  userMap: Map<string, string>
): Promise<void> {
  log("Seeding advance payments...");
  const adminId = getUser(userMap, "admin@pi-dash.dev");
  const leadId = getUser(userMap, "lead@pi-dash.dev");

  await db
    .insert(advancePayment)
    .values({
      id: ID.adv01,
      userId: leadId,
      title: "Advance for community hall booking",
      city: "bangalore",
      status: "approved",
      bankAccountName: "Priya Savings",
      bankAccountNumber: "2001200034005601",
      bankAccountIfscCode: "HDFC0002345",
      reviewedBy: adminId,
      reviewedAt: past(3),
      submittedAt: past(5),
      createdAt: past(7),
      updatedAt: past(3),
    })
    .onConflictDoNothing();

  await db
    .insert(advancePaymentLineItem)
    .values({
      id: ID.advLi01,
      advancePaymentId: ID.adv01,
      categoryId: ID.catVenue,
      description: "Hall booking advance (50%)",
      amount: "10000.00",
      sortOrder: 0,
      createdAt: past(7),
      updatedAt: past(7),
    })
    .onConflictDoNothing();
  await db
    .insert(advancePaymentLineItem)
    .values({
      id: ID.advLi02,
      advancePaymentId: ID.adv01,
      categoryId: ID.catEquipment,
      description: "Sound system rental deposit",
      amount: "3000.00",
      sortOrder: 1,
      createdAt: past(7),
      updatedAt: past(7),
    })
    .onConflictDoNothing();

  // Attachment
  await db
    .insert(advancePaymentAttachment)
    .values({
      id: ID.advA01,
      advancePaymentId: ID.adv01,
      type: "file",
      filename: "hall-booking-confirmation.pdf",
      objectKey: "dev/advances/hall-booking-confirmation.pdf",
      mimeType: "application/pdf",
      createdAt: past(6),
    })
    .onConflictDoNothing();

  // History
  for (const h of [
    { id: ID.advH01, action: "created" as const, actor: leadId, at: past(7) },
    { id: ID.advH02, action: "submitted" as const, actor: leadId, at: past(5) },
    { id: ID.advH03, action: "approved" as const, actor: adminId, at: past(3) },
  ]) {
    await db
      .insert(advancePaymentHistory)
      .values({
        id: h.id,
        advancePaymentId: ID.adv01,
        actorId: h.actor,
        action: h.action,
        createdAt: h.at,
      })
      .onConflictDoNothing();
  }

  log("1 advance payment seeded");
}

// ── 10. Vendors + Payments + Transactions ────────────────────────────────────

async function seedVendors(userMap: Map<string, string>): Promise<void> {
  log("Seeding vendors and payments...");
  const adminId = getUser(userMap, "admin@pi-dash.dev");
  const leadId = getUser(userMap, "lead@pi-dash.dev");
  const v1 = getUser(userMap, "volunteer1@pi-dash.dev");

  // Vendor 1 — Approved
  await db
    .insert(vendor)
    .values({
      id: ID2.vendor01,
      name: "QuickPrint Solutions",
      contactEmail: "info@quickprint.dev",
      contactPhone: "+919800011122",
      bankAccountName: "QuickPrint Solutions",
      bankAccountNumber: "7771234567890",
      bankAccountIfscCode: "HDFC0007890",
      address: "42 MG Road, Bangalore",
      gstNumber: "29AABCQ1234F1ZA",
      status: "approved",
      createdBy: leadId,
      createdAt: past(60),
      updatedAt: past(55),
    })
    .onConflictDoNothing();

  // Vendor 2 — Pending
  await db
    .insert(vendor)
    .values({
      id: ID2.vendor02,
      name: "Fresh Kitchen Caterers",
      contactEmail: "orders@freshkitchen.dev",
      contactPhone: "+919800033344",
      bankAccountName: "Fresh Kitchen Caterers",
      bankAccountNumber: "8881234567891",
      bankAccountIfscCode: "ICIC0008901",
      address: "15 Food Street, Bangalore",
      panNumber: "AABCF1234G",
      status: "pending",
      createdBy: v1,
      createdAt: past(5),
      updatedAt: past(5),
    })
    .onConflictDoNothing();

  // Vendor Payment 1 — partially paid
  await db
    .insert(vendorPayment)
    .values({
      id: ID2.vp01,
      userId: leadId,
      vendorId: ID2.vendor01,
      title: "Banner printing for outreach event",
      status: "partially_paid",
      reviewedBy: adminId,
      reviewedAt: past(12),
      submittedAt: past(14),
      createdAt: past(15),
      updatedAt: past(8),
    })
    .onConflictDoNothing();

  await db
    .insert(vendorPaymentLineItem)
    .values({
      id: ID2.vpLi01,
      vendorPaymentId: ID2.vp01,
      categoryId: ID.catPrinting,
      description: "10 vinyl banners (6x3 ft)",
      amount: "8500.00",
      sortOrder: 0,
      createdAt: past(15),
      updatedAt: past(15),
    })
    .onConflictDoNothing();
  await db
    .insert(vendorPaymentLineItem)
    .values({
      id: ID2.vpLi02,
      vendorPaymentId: ID2.vp01,
      categoryId: ID.catPrinting,
      description: "500 flyers (A5)",
      amount: "2500.00",
      sortOrder: 1,
      createdAt: past(15),
      updatedAt: past(15),
    })
    .onConflictDoNothing();

  // VP1 attachments
  await db
    .insert(vendorPaymentAttachment)
    .values({
      id: ID2.vpA01,
      vendorPaymentId: ID2.vp01,
      type: "file",
      purpose: "quotation",
      filename: "quickprint-quotation.pdf",
      objectKey: "dev/vendors/quickprint-quotation.pdf",
      mimeType: "application/pdf",
      createdAt: past(16),
    })
    .onConflictDoNothing();
  await db
    .insert(vendorPaymentAttachment)
    .values({
      id: ID2.vpA02,
      vendorPaymentId: ID2.vp01,
      type: "file",
      purpose: "invoice",
      filename: "quickprint-invoice-001.pdf",
      objectKey: "dev/vendors/quickprint-invoice-001.pdf",
      mimeType: "application/pdf",
      createdAt: past(11),
    })
    .onConflictDoNothing();

  // VP1 history
  for (const h of [
    { id: ID2.vpH01, action: "created" as const, actor: leadId, at: past(15) },
    {
      id: ID2.vpH02,
      action: "submitted" as const,
      actor: leadId,
      at: past(14),
    },
    {
      id: ID2.vpH03,
      action: "approved" as const,
      actor: adminId,
      at: past(12),
    },
  ]) {
    await db
      .insert(vendorPaymentHistory)
      .values({
        id: h.id,
        vendorPaymentId: ID2.vp01,
        actorId: h.actor,
        action: h.action,
        createdAt: h.at,
      })
      .onConflictDoNothing();
  }

  // Transaction for VP1
  await db
    .insert(vendorPaymentTransaction)
    .values({
      id: ID2.vpt01,
      vendorPaymentId: ID2.vp01,
      userId: adminId,
      amount: "5000.00",
      description: "First installment via NEFT",
      transactionDate: past(10),
      paymentMethod: "NEFT",
      paymentReference: "NEFT-REF-001",
      status: "approved",
      reviewedBy: adminId,
      reviewedAt: past(9),
      createdAt: past(10),
      updatedAt: past(9),
    })
    .onConflictDoNothing();

  await db
    .insert(vendorPaymentTransactionAttachment)
    .values({
      id: ID2.vptA01,
      vendorPaymentTransactionId: ID2.vpt01,
      type: "file",
      filename: "neft-confirmation.png",
      objectKey: "dev/transactions/neft-confirmation.png",
      mimeType: "image/png",
      createdAt: past(9),
    })
    .onConflictDoNothing();

  for (const h of [
    {
      id: ID2.vptH01,
      action: "created" as const,
      actor: adminId,
      at: past(10),
    },
    {
      id: ID2.vptH02,
      action: "approved" as const,
      actor: adminId,
      at: past(9),
    },
  ]) {
    await db
      .insert(vendorPaymentTransactionHistory)
      .values({
        id: h.id,
        vendorPaymentTransactionId: ID2.vpt01,
        actorId: h.actor,
        action: h.action,
        createdAt: h.at,
      })
      .onConflictDoNothing();
  }

  // Vendor Payment 2 — pending
  await db
    .insert(vendorPayment)
    .values({
      id: ID2.vp02,
      userId: v1,
      vendorId: ID2.vendor02,
      title: "Catering for weekend seva",
      status: "pending",
      submittedAt: past(2),
      createdAt: past(3),
      updatedAt: past(2),
    })
    .onConflictDoNothing();
  await db
    .insert(vendorPaymentLineItem)
    .values({
      id: ID2.vpLi03,
      vendorPaymentId: ID2.vp02,
      categoryId: ID.catFood,
      description: "Lunch for 50 people",
      amount: "15000.00",
      sortOrder: 0,
      createdAt: past(3),
      updatedAt: past(3),
    })
    .onConflictDoNothing();
  for (const h of [
    { id: ID2.vpH04, action: "created" as const, actor: v1, at: past(3) },
    { id: ID2.vpH05, action: "submitted" as const, actor: v1, at: past(2) },
  ]) {
    await db
      .insert(vendorPaymentHistory)
      .values({
        id: h.id,
        vendorPaymentId: ID2.vp02,
        actorId: h.actor,
        action: h.action,
        createdAt: h.at,
      })
      .onConflictDoNothing();
  }

  log("2 vendors, 2 payments, 1 transaction seeded");
}

// ── 11. Scheduled Messages ───────────────────────────────────────────────────

async function seedScheduledMessages(
  userMap: Map<string, string>
): Promise<void> {
  log("Seeding scheduled messages...");
  const adminId = getUser(userMap, "admin@pi-dash.dev");
  const leadId = getUser(userMap, "lead@pi-dash.dev");
  const v1 = getUser(userMap, "volunteer1@pi-dash.dev");

  // Message 1 — past, sent to groups
  await db
    .insert(scheduledMessage)
    .values({
      id: ID2.sm01,
      message:
        "Reminder: Weekly teaching session tomorrow at 10 AM. Please confirm attendance.",
      scheduledAt: past(2),
      createdBy: leadId,
      createdAt: past(4),
      updatedAt: past(2),
    })
    .onConflictDoNothing();
  await db
    .insert(scheduledMessageRecipient)
    .values({
      id: ID2.smr01,
      scheduledMessageId: ID2.sm01,
      recipientId: ID.waTeaching,
      label: "Teaching Team",
      type: "group",
      status: "sent",
      sentAt: past(2),
      retryCount: 0,
      createdAt: past(4),
      updatedAt: past(2),
    })
    .onConflictDoNothing();
  await db
    .insert(scheduledMessageRecipient)
    .values({
      id: ID2.smr02,
      scheduledMessageId: ID2.sm01,
      recipientId: ID.waCoordinators,
      label: "Event Coordinators",
      type: "group",
      status: "sent",
      sentAt: past(2),
      retryCount: 0,
      createdAt: past(4),
      updatedAt: past(2),
    })
    .onConflictDoNothing();

  // Message 2 — future, pending, with attachment
  await db
    .insert(scheduledMessage)
    .values({
      id: ID2.sm02,
      message:
        "Hi! Please find the updated volunteer schedule for next month attached.",
      scheduledAt: future(3),
      attachments: [
        {
          fileName: "schedule-april.pdf",
          mimeType: "application/pdf",
          r2Key: "dev/messages/schedule-april.pdf",
        },
      ],
      createdBy: adminId,
      createdAt: past(1),
      updatedAt: past(1),
    })
    .onConflictDoNothing();
  await db
    .insert(scheduledMessageRecipient)
    .values({
      id: ID2.smr03,
      scheduledMessageId: ID2.sm02,
      recipientId: v1,
      label: "Rahul Verma",
      type: "user",
      status: "pending",
      retryCount: 0,
      createdAt: past(1),
      updatedAt: past(1),
    })
    .onConflictDoNothing();
  await db
    .insert(scheduledMessageRecipient)
    .values({
      id: ID2.smr04,
      scheduledMessageId: ID2.sm02,
      recipientId: ID.waKitchen,
      label: "Kitchen Duty",
      type: "group",
      status: "pending",
      retryCount: 0,
      createdAt: past(1),
      updatedAt: past(1),
    })
    .onConflictDoNothing();

  // Message 3 — past, mixed statuses
  await db
    .insert(scheduledMessage)
    .values({
      id: ID2.sm03,
      message:
        "Important: Venue change for Saturday's event. New location: Cubbon Park entrance gate 2.",
      scheduledAt: past(1),
      createdBy: adminId,
      createdAt: past(3),
      updatedAt: past(1),
    })
    .onConflictDoNothing();
  await db
    .insert(scheduledMessageRecipient)
    .values({
      id: ID2.smr05,
      scheduledMessageId: ID2.sm03,
      recipientId: ID.waWeekend,
      label: "Weekend Seva",
      type: "group",
      status: "sent",
      sentAt: past(1),
      retryCount: 0,
      createdAt: past(3),
      updatedAt: past(1),
    })
    .onConflictDoNothing();
  await db
    .insert(scheduledMessageRecipient)
    .values({
      id: ID2.smr06,
      scheduledMessageId: ID2.sm03,
      recipientId: leadId,
      label: "Priya Sharma",
      type: "user",
      status: "failed",
      error: "User phone number not registered on WhatsApp",
      retryCount: 2,
      createdAt: past(3),
      updatedAt: past(1),
    })
    .onConflictDoNothing();
  await db
    .insert(scheduledMessageRecipient)
    .values({
      id: ID2.smr07,
      scheduledMessageId: ID2.sm03,
      recipientId: ID.waTeaching,
      label: "Teaching Team",
      type: "group",
      status: "cancelled",
      retryCount: 0,
      createdAt: past(3),
      updatedAt: past(1),
    })
    .onConflictDoNothing();

  log("3 scheduled messages seeded");
}

// ── 12. Notification Preferences ─────────────────────────────────────────────

async function seedNotificationPreferences(
  userMap: Map<string, string>
): Promise<void> {
  log("Seeding notification preferences...");
  const adminId = getUser(userMap, "admin@pi-dash.dev");
  const v1 = getUser(userMap, "volunteer1@pi-dash.dev");
  const v2 = getUser(userMap, "volunteer2@pi-dash.dev");

  const prefs = [
    {
      userId: adminId,
      topicId: "Requests - New Submissions",
      emailEnabled: true,
      whatsappEnabled: false,
    },
    {
      userId: v1,
      topicId: "Events - Schedule",
      emailEnabled: false,
      whatsappEnabled: true,
    },
    {
      userId: v1,
      topicId: "Events - Photos",
      emailEnabled: false,
      whatsappEnabled: false,
    },
    {
      userId: v2,
      topicId: "Teams",
      emailEnabled: true,
      whatsappEnabled: false,
    },
  ];

  await db
    .insert(notificationTopicPreference)
    .values(prefs)
    .onConflictDoNothing();
  log(`${prefs.length} notification preferences seeded`);
}

// ── 13. App Config ───────────────────────────────────────────────────────────

async function seedAppConfig(): Promise<void> {
  log("Seeding app config...");
  const configs = [
    { key: "org_name", value: "Proud Indian NGO" },
    { key: "org_city", value: "Bangalore" },
    { key: "reimbursement_auto_approve_limit", value: "500" },
  ];

  await db
    .insert(appConfig)
    .values(
      configs.map((c) => ({ key: c.key, value: c.value, updatedAt: now }))
    )
    .onConflictDoNothing();
  log(`${configs.length} config entries ready`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  process.stdout.write("=== Seeding Dev Data ===\n");

  await syncPermissions();
  log("Permissions synced");

  const userMap = await seedUsers();
  await seedCategories();
  await seedBankAccounts(userMap);
  await seedWhatsappGroups();
  await seedTeams(userMap);
  await seedEvents(userMap);
  await seedEventExtras(userMap);
  await seedReimbursements(userMap);
  await seedAdvancePayments(userMap);
  await seedVendors(userMap);
  await seedScheduledMessages(userMap);
  await seedNotificationPreferences(userMap);
  await seedAppConfig();

  process.stdout.write("\n=== Dev data seeded successfully! ===\n");
  process.exit(0);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `Seed failed: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
