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
 *   team, teamMember, teamEvent, teamEventMember, eventRsvpPoll, eventRsvpVote,
 *   eventInterest, eventFeedback, eventFeedbackSubmission,
 *   eventPhoto, eventImmichAlbum, eventUpdate,
 *   expenseCategory, bankAccount,
 *   reimbursement, reimbursementLineItem, reimbursementAttachment, reimbursementHistory,
 *   advancePayment, advancePaymentLineItem, advancePaymentAttachment, advancePaymentHistory,
 *   vendor, vendorPayment, vendorPaymentLineItem, vendorPaymentAttachment, vendorPaymentHistory,
 *   vendorPaymentTransaction, vendorPaymentTransactionAttachment, vendorPaymentTransactionHistory,
 *   notification,
 *   scheduledMessage, scheduledMessageRecipient
 */

import { createHash } from "node:crypto";
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
import { eventRsvpPoll, eventRsvpVote } from "@pi-dash/db/schema/event-rsvp";
import { eventUpdate } from "@pi-dash/db/schema/event-update";
import { expenseCategory } from "@pi-dash/db/schema/expense-category";
import {
  kalakritiAgeCategory,
  kalakritiAssignment,
  kalakritiAuditEntry,
  kalakritiCenter,
  kalakritiCenterAgeQuota,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiExternalIdentity,
  kalakritiGuardianCenter,
} from "@pi-dash/db/schema/kalakriti";
import { notification } from "@pi-dash/db/schema/notification";
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
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
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
import { uuidv7 } from "uuidv7";

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

function hashPollOption(option: string): string {
  return createHash("sha256").update(option).digest("hex");
}

// ── Deterministic IDs ────────────────────────────────────────────────────────

const ID = {
  // Advance payments
  adv01: "019d52c2-7261-7dce-b0ee-e24661a8986a",
  advA01: "019d52c2-7261-7dce-b0ee-e2496c35ca3e",
  advH01: "019d52c2-7261-7dce-b0ee-e24af4242ec9",
  advH02: "019d52c2-7261-7dce-b0ee-e24b84bd3e7e",
  advH03: "019d52c2-7261-7dce-b0ee-e24ccaf3bcb2",
  advLi01: "019d52c2-7261-7dce-b0ee-e247832746fc",
  advLi02: "019d52c2-7261-7dce-b0ee-e248ba3fa109",
  // Bank accounts
  ba01: "019d52c2-7261-7dce-b0ee-e22c3629534f",
  ba02: "019d52c2-7261-7dce-b0ee-e22de4d2f683",
  ba03: "019d52c2-7261-7dce-b0ee-e22ec1a7e2e5",
  ba04: "019d52c2-7261-7dce-b0ee-e22fe64b07bc",
  ba05: "019d52c2-7261-7dce-b0ee-e23031bee77c",
  ba06: "019d52c2-7261-7dce-b0ee-e231ffdfea4d",
  catAccom: "019d52c2-7261-7dce-b0ee-e2264856a924",
  catEquipment: "019d52c2-7261-7dce-b0ee-e22a02404b34",
  catFood: "019d52c2-7261-7dce-b0ee-e2250fe72d32",
  catMisc: "019d52c2-7261-7dce-b0ee-e22b65aa7b15",
  catPrinting: "019d52c2-7261-7dce-b0ee-e228caa3857f",
  catSupplies: "019d52c2-7261-7dce-b0ee-e2274dee1771",
  // Expense categories
  catTravel: "019d52c2-7261-7dce-b0ee-e2240bbad6ff",
  catVenue: "019d52c2-7261-7dce-b0ee-e22961d6c773",
  efsTeachingV3: "019d52c2-7261-7dce-b0ee-e21d5ea9516c",
  efTeaching: "019d52c2-7261-7dce-b0ee-e21c9eb9ef2f",
  eiaPlanning: "019d52c2-7261-7dce-b0ee-e221103892e4",
  eiaTeaching: "019d52c2-7261-7dce-b0ee-e220a48dfee3",
  // Event extras
  eiOutreachV3: "019d52c2-7261-7dce-b0ee-e21a61d64779",
  eiOutreachV4: "019d52c2-7261-7dce-b0ee-e21ba52dd57b",
  epTeaching1: "019d52c2-7261-7dce-b0ee-e21ea1a161f6",
  epTeaching2: "019d52c2-7261-7dce-b0ee-e21f8e48bc04",
  epTeachingVid1: "019d52c2-7261-7dce-b0ee-e21fa2b3c4d5",
  epTeachingVid2: "019d52c2-7261-7dce-b0ee-e21fb3c4d5e6",
  // Event reminders sent
  ers01: "019d52c2-7261-7dce-b0ee-e260a1b2c3d4",
  ers02: "019d52c2-7261-7dce-b0ee-e261b2c3d4e5",
  euOutreach: "019d52c2-7261-7dce-b0ee-e223abc37f66",
  euPlanning: "019d52c2-7261-7dce-b0ee-e2221e6385fa",
  // Events
  evKalakriti: "019d52c2-7261-7dce-b0ee-e2143101d420",
  evKitchen: "019d52c2-7261-7dce-b0ee-e216e531c68d",
  evOutreach: "019d52c2-7261-7dce-b0ee-e217bda25bc8",
  evPlanning: "019d52c2-7261-7dce-b0ee-e2182d2e359e",
  evSupply: "019d52c2-7261-7dce-b0ee-e219e08de6fd",
  evTeaching: "019d52c2-7261-7dce-b0ee-e2143101d41f",
  evTeachingNext: "019d52c2-7261-7dce-b0ee-e215aeea8546",
  kalakritiAgeCategory: "019d52c2-7261-7dce-b0ee-e206561715c8",
  kalakritiAudit: "019d52c2-7261-7dce-b0ee-e206561715c4",
  kalakritiCenter: "019d52c2-7261-7dce-b0ee-e206561715c6",
  kalakritiCenterAgeQuota: "019d52c2-7261-7dce-b0ee-e206561715c9",
  kalakritiEdition: "019d52c2-7261-7dce-b0ee-e206561715c0",
  kalakritiEditionAdminAssignment: "019d52c2-7261-7dce-b0ee-e206561715c3",
  kalakritiEditionAdminEventMember: "019d52c2-7261-7dce-b0ee-e206561715c5",
  kalakritiEditionAdminMembership: "019d52c2-7261-7dce-b0ee-e206561715c1",
  kalakritiGuardianCenter: "019d52c2-7261-7dce-b0ee-e206561715c7",
  kalakritiGuardianMembership: "019d52c2-7261-7dce-b0ee-e206561715c2",
  ra01: "019d52c2-7261-7dce-b0ee-e23c364fad5e",
  ra02: "019d52c2-7261-7dce-b0ee-e23d74ae80a5",
  // Reimbursements
  reimb01: "019d52c2-7261-7dce-b0ee-e2321e761b1b",
  reimb02: "019d52c2-7261-7dce-b0ee-e23376d48e70",
  reimb03: "019d52c2-7261-7dce-b0ee-e234b5afd298",
  reimb04: "019d52c2-7261-7dce-b0ee-e235d60fa4f1",
  rh01: "019d52c2-7261-7dce-b0ee-e23ed133ba5e",
  rh02: "019d52c2-7261-7dce-b0ee-e23ffa230e15",
  rh03: "019d52c2-7261-7dce-b0ee-e2400dfa4b1d",
  rh04: "019d52c2-7261-7dce-b0ee-e24179eafe07",
  rh05: "019d52c2-7261-7dce-b0ee-e242d948d519",
  rh06: "019d52c2-7261-7dce-b0ee-e24341d099cb",
  rh07: "019d52c2-7261-7dce-b0ee-e2441bdffc0e",
  rh08: "019d52c2-7261-7dce-b0ee-e24565289429",
  rli01: "019d52c2-7261-7dce-b0ee-e236266cd1d5",
  rli02: "019d52c2-7261-7dce-b0ee-e237e81528f0",
  rli03: "019d52c2-7261-7dce-b0ee-e23847f8fe38",
  rli04: "019d52c2-7261-7dce-b0ee-e2391b743da4",
  rli05: "019d52c2-7261-7dce-b0ee-e23a1adb4ff4",
  rli06: "019d52c2-7261-7dce-b0ee-e23b2c6aa7af",
  teamEvents: "019d52c2-7261-7dce-b0ee-e206561715b9",
  teamKitchen: "019d52c2-7261-7dce-b0ee-e205272f7c93",
  teamLogistics: "019d52c2-7261-7dce-b0ee-e20775aad61e",
  // Teams
  teamTeaching: "019d52c2-7260-7d08-8a7b-fddcf9468d71",
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
  waCoordinators: "019d52c2-7260-7d08-8a7b-fdda671bc0c6",
  waKitchen: "019d52c2-7260-7d08-8a7b-fdd955064aa7",
  // WhatsApp groups
  waTeaching: "019d52c2-7260-7d08-8a7b-fdd8adb38030",
  waWeekend: "019d52c2-7260-7d08-8a7b-fddb082a270e",
} as const;

// Second batch of IDs for vendors, scheduled messages, etc.
const ID2 = {
  // RSVP polls
  rsvpPoll01: "019d52c3-0000-7000-8000-00000000001d",
  rsvpPoll02: "019d52c3-0000-7000-8000-00000000001e",
  rsvpVote01: "019d52c3-0000-7000-8000-00000000001f",
  rsvpVote02: "019d52c3-0000-7000-8000-000000000020",
  rsvpVote03: "019d52c3-0000-7000-8000-000000000021",
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
  // Vendors
  vendor01: "019d52c3-0000-7000-8000-000000000001",
  vendor02: "019d52c3-0000-7000-8000-000000000002",
  vp01: "019d52c3-0000-7000-8000-000000000003",
  vp02: "019d52c3-0000-7000-8000-000000000004",
  vpA01: "019d52c3-0000-7000-8000-000000000008",
  vpA02: "019d52c3-0000-7000-8000-000000000009",
  vpH01: "019d52c3-0000-7000-8000-00000000000a",
  vpH02: "019d52c3-0000-7000-8000-00000000000b",
  vpH03: "019d52c3-0000-7000-8000-00000000000c",
  vpH04: "019d52c3-0000-7000-8000-00000000000d",
  vpH05: "019d52c3-0000-7000-8000-00000000000e",
  vpLi01: "019d52c3-0000-7000-8000-000000000005",
  vpLi02: "019d52c3-0000-7000-8000-000000000006",
  vpLi03: "019d52c3-0000-7000-8000-000000000007",
  // Vendor payment transaction
  vpt01: "019d52c3-0000-7000-8000-00000000000f",
  vptA01: "019d52c3-0000-7000-8000-000000000010",
  vptH01: "019d52c3-0000-7000-8000-000000000011",
  vptH02: "019d52c3-0000-7000-8000-000000000012",
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
    gender: "male",
    name: "Dev Admin",
    password: "Admin123!",
    phone: "+919876543210",
    role: "super_admin",
  },
  {
    email: "lead@pi-dash.dev",
    gender: "female",
    name: "Priya Sharma",
    password: "Lead123!",
    phone: "+919876543211",
    role: "admin",
  },
  {
    email: "finance@pi-dash.dev",
    gender: "female",
    name: "Sneha Gupta",
    password: "Finance123!",
    phone: "+919876543217",
    role: "finance_admin",
  },
  {
    email: "volunteer1@pi-dash.dev",
    gender: "male",
    name: "Rahul Verma",
    password: "Volunteer123!",
    phone: "+919876543212",
    role: "volunteer",
  },
  {
    email: "volunteer2@pi-dash.dev",
    gender: "female",
    name: "Ananya Patel",
    password: "Volunteer123!",
    phone: "+919876543213",
    role: "volunteer",
  },
  {
    email: "volunteer3@pi-dash.dev",
    gender: "male",
    name: "Vikram Singh",
    password: "Volunteer123!",
    phone: "+919876543214",
    role: "volunteer",
  },
  {
    email: "newbie@pi-dash.dev",
    gender: "male",
    name: "Arjun Nair",
    password: "Newbie123!",
    phone: "+919876543216",
    role: "unoriented_volunteer",
  },
  {
    email: "guardian@pi-dash.dev",
    name: "Dev Guardian",
    password: "Guardian123!",
    phone: "+919876543218",
    role: "external_user",
  },
];

// ── 1. Users ─────────────────────────────────────────────────────────────────

async function seedUsers(): Promise<Map<string, string>> {
  log("Seeding users...");
  const userMap = new Map<string, string>();

  await Promise.all(
    USERS.map(async (u) => {
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
          emailVerified: true,
          gender: u.gender,
          isActive: true,
          isOnWhatsapp: true,
          phone: u.phone,
          role: u.role,
        })
        .where(eq(user.id, record.id));

      userMap.set(u.email, record.id);
    })
  );

  log(`${userMap.size} users ready`);
  return userMap;
}

// ── 2. Expense Categories ────────────────────────────────────────────────────

const CATEGORIES = [
  {
    description: "Transportation and commute expenses",
    id: ID.catTravel,
    name: "Travel",
  },
  { description: "Meals and refreshments", id: ID.catFood, name: "Food" },
  { description: "Hotel and lodging", id: ID.catAccom, name: "Accommodation" },
  {
    description: "Office and event supplies",
    id: ID.catSupplies,
    name: "Supplies",
  },
  {
    description: "Banners, flyers, and print material",
    id: ID.catPrinting,
    name: "Printing",
  },
  {
    description: "Venue rental and booking charges",
    id: ID.catVenue,
    name: "Venue",
  },
  {
    description: "Equipment rental and purchase",
    id: ID.catEquipment,
    name: "Equipment",
  },
  {
    description: "Other uncategorized expenses",
    id: ID.catMisc,
    name: "Miscellaneous",
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
      email: "admin@pi-dash.dev",
      id: ID.ba01,
      ifsc: "SBIN0001234",
      name: "Dev Admin Savings",
      num: "1001200034005600",
    },
    {
      email: "lead@pi-dash.dev",
      id: ID.ba02,
      ifsc: "HDFC0002345",
      name: "Priya Savings",
      num: "2001200034005601",
    },
    {
      email: "volunteer1@pi-dash.dev",
      id: ID.ba03,
      ifsc: "ICIC0003456",
      name: "Rahul Savings",
      num: "3001200034005602",
    },
    {
      email: "volunteer2@pi-dash.dev",
      id: ID.ba04,
      ifsc: "AXIS0004567",
      name: "Ananya Savings",
      num: "4001200034005603",
    },
    {
      email: "volunteer3@pi-dash.dev",
      id: ID.ba05,
      ifsc: "UTIB0005678",
      name: "Vikram Salary",
      num: "5001200034005604",
    },
    {
      email: "finance@pi-dash.dev",
      id: ID.ba06,
      ifsc: "KKBK0006789",
      name: "Sneha Current",
      num: "6001200034005605",
    },
  ];

  const rows = accounts
    .map((a) => {
      const userId = userMap.get(a.email);
      if (!userId) {
        return null;
      }
      return {
        accountName: a.name,
        accountNumber: a.num,
        createdAt: now,
        id: a.id,
        ifscCode: a.ifsc,
        isDefault: true,
        updatedAt: now,
        userId,
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
  { id: ID.waTeaching, jid: "120363001234567890@g.us", name: "Teaching Team" },
  { id: ID.waKitchen, jid: "120363002345678901@g.us", name: "Kitchen Duty" },
  {
    id: ID.waCoordinators,
    jid: "120363003456789012@g.us",
    name: "Event Coordinators",
  },
  { id: ID.waWeekend, jid: "120363004567890123@g.us", name: "Weekend Seva" },
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
      members: [
        { id: ID.tm01, role: "lead" as const, uid: leadId },
        { id: ID.tm02, role: "member" as const, uid: v1 },
        { id: ID.tm03, role: "member" as const, uid: v2 },
      ],
      name: "Teaching",
      waId: ID.waTeaching,
    },
    {
      id: ID.teamKitchen,
      members: [
        { id: ID.tm04, role: "lead" as const, uid: v3 },
        { id: ID.tm05, role: "member" as const, uid: v1 },
      ],
      name: "Kitchen",
      waId: ID.waKitchen,
    },
    {
      id: ID.teamEvents,
      members: [
        { id: ID.tm06, role: "lead" as const, uid: adminId },
        { id: ID.tm07, role: "member" as const, uid: leadId },
        { id: ID.tm08, role: "member" as const, uid: v2 },
        { id: ID.tm09, role: "member" as const, uid: v3 },
      ],
      name: "Events & Outreach",
      waId: ID.waCoordinators,
    },
    {
      id: ID.teamLogistics,
      members: [
        { id: ID.tm10, role: "lead" as const, uid: v1 },
        { id: ID.tm11, role: "member" as const, uid: v2 },
        { id: ID.tm12, role: "member" as const, uid: v3 },
      ],
      name: "Logistics",
      waId: null,
    },
  ];

  await Promise.all(
    teams.map(async (t) => {
      await db
        .insert(team)
        .values({
          createdAt: now,
          description: `The ${t.name} team`,
          id: t.id,
          name: t.name,
          updatedAt: now,
          whatsappGroupId: t.waId ?? undefined,
        })
        .onConflictDoNothing();

      await Promise.all(
        t.members.map((m) =>
          db
            .insert(teamMember)
            .values({
              id: m.id,
              joinedAt: past(30),
              role: m.role,
              teamId: t.id,
              userId: m.uid,
            })
            .onConflictDoNothing()
        )
      );
    })
  );
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
      city: "bangalore" as const,
      creator: leadId,
      end: addHours(past(7), 2),
      feedbackEnabled: true,
      id: ID.evTeaching,
      isPublic: true,
      location: "Bangalore Community Hall",
      members: [leadId, v1, v2],
      name: "Weekly Teaching Session",
      start: past(7),
      teamId: ID.teamTeaching,
    },
    {
      city: "bangalore" as const,
      creator: leadId,
      end: addHours(future(2), 2),
      id: ID.evTeachingNext,
      isPublic: true,
      location: "Bangalore Community Hall",
      members: [leadId, v1],
      name: "Upcoming Teaching Session",
      start: future(2),
      teamId: ID.teamTeaching,
    },
    {
      city: "mumbai" as const,
      creator: v3,
      end: addHours(past(3), 4),
      id: ID.evKitchen,
      isPublic: false,
      location: "Main Kitchen",
      members: [v3, v1],
      name: "Kitchen Prep Day",
      start: past(3),
      teamId: ID.teamKitchen,
    },
    {
      city: "bangalore" as const,
      creator: adminId,
      end: addHours(future(7), 6),
      feedbackEnabled: true,
      id: ID.evOutreach,
      isPublic: true,
      location: "Cubbon Park, Bangalore",
      members: [adminId, leadId, v2],
      name: "Community Outreach Drive",
      reminderIntervals: [4320, 1440, 120],
      reminderTarget: "both" as const,
      start: future(7),
      teamId: ID.teamEvents,
    },
    {
      city: "mumbai" as const,
      creator: adminId,
      end: addHours(past(14), 1),
      id: ID.evPlanning,
      isPublic: false,
      location: "Office Conference Room",
      members: [adminId, leadId, v3],
      name: "Monthly Planning Meeting",
      start: past(14),
      teamId: ID.teamEvents,
    },
    {
      city: "bangalore" as const,
      creator: v1,
      end: addHours(future(1), 3),
      id: ID.evSupply,
      isPublic: false,
      location: "Wholesale Market",
      members: [v1, v2],
      name: "Supply Run",
      reminderIntervals: [1440, 120],
      start: future(1),
      teamId: ID.teamLogistics,
    },
  ];

  await Promise.all(
    events.map(async (e) => {
      await db
        .insert(teamEvent)
        .values({
          city: e.city,
          createdAt: subDays(e.start, 5),
          createdBy: e.creator,
          description: `${e.name} — organized by the team`,
          endTime: e.end,
          feedbackDeadline: e.feedbackEnabled ? future(3) : undefined,
          feedbackEnabled: e.feedbackEnabled ?? false,
          id: e.id,
          isPublic: e.isPublic,
          location: e.location,
          name: e.name,
          reminderIntervals: e.reminderIntervals ?? null,
          reminderTarget: e.reminderTarget ?? "group",
          startTime: e.start,
          teamId: e.teamId,
          updatedAt: subDays(e.start, 5),
        })
        .onConflictDoNothing();

      const isPast = e.start < now;
      await Promise.all(
        e.members.map((uid) => {
          if (isPast) {
            return db.execute(sql`
          INSERT INTO team_event_member (id, event_id, user_id, added_at, attendance, attendance_marked_at, attendance_marked_by)
          VALUES (${uuidv7()}, ${e.id}, ${uid}, ${subDays(e.start, 3).toISOString()},
            'present'::attendance_status, ${e.end.toISOString()}, ${e.creator})
          ON CONFLICT (event_id, user_id) DO NOTHING
        `);
          }
          return db.execute(sql`
          INSERT INTO team_event_member (id, event_id, user_id, added_at)
          VALUES (${uuidv7()}, ${e.id}, ${uid}, ${past(3).toISOString()})
          ON CONFLICT (event_id, user_id) DO NOTHING
        `);
        })
      );
    })
  );
  log(`${events.length} events ready`);
}

async function seedKalakriti(userMap: Map<string, string>): Promise<void> {
  log("Seeding Kalakriti edition...");
  const adminId = getUser(userMap, "admin@pi-dash.dev");
  const editionAdminId = getUser(userMap, "volunteer1@pi-dash.dev");
  const guardianId = getUser(userMap, "guardian@pi-dash.dev");
  const eventDate = new Date("2027-11-21T00:00:00+05:30");

  await db
    .insert(teamEvent)
    .values({
      city: "bangalore",
      createdAt: now,
      createdBy: adminId,
      description: "Technical event record managed by the Kalakriti module.",
      id: ID.evKalakriti,
      isPublic: false,
      managementDomain: "kalakriti",
      name: "Kalakriti 2027",
      startTime: eventDate,
      teamId: ID.teamEvents,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: { managementDomain: "kalakriti" },
      target: teamEvent.id,
    });

  await db
    .insert(kalakritiEdition)
    .values({
      ageCutoffDate: "2027-06-01",
      brandingKey: "kalakriti-2027",
      createdAt: now,
      createdBy: adminId,
      eventDate: "2027-11-21",
      id: ID.kalakritiEdition,
      lifecycle: "draft",
      name: "Kalakriti 2027",
      plannedRegistrationCloseAt: new Date("2027-10-31T23:59:00+05:30"),
      teamEventId: ID.evKalakriti,
      updatedAt: now,
      year: 2027,
    })
    .onConflictDoNothing();

  await db
    .insert(kalakritiExternalIdentity)
    .values({ createdAt: now, createdBy: adminId, userId: guardianId })
    .onConflictDoNothing();

  await db
    .insert(kalakritiEditionMembership)
    .values([
      {
        createdAt: now,
        createdBy: adminId,
        editionId: ID.kalakritiEdition,
        id: ID.kalakritiEditionAdminMembership,
        kind: "volunteer",
        snapshotEmail: "volunteer1@pi-dash.dev",
        snapshotName: "Rahul Verma",
        snapshotPhone: "+919876543212",
        updatedAt: now,
        userId: editionAdminId,
      },
      {
        createdAt: now,
        createdBy: adminId,
        editionId: ID.kalakritiEdition,
        id: ID.kalakritiGuardianMembership,
        kind: "guardian",
        snapshotEmail: "guardian@pi-dash.dev",
        snapshotName: "Dev Guardian",
        snapshotPhone: "+919876543218",
        updatedAt: now,
        userId: guardianId,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(kalakritiAssignment)
    .values({
      createdAt: now,
      createdBy: adminId,
      editionId: ID.kalakritiEdition,
      id: ID.kalakritiEditionAdminAssignment,
      isPrimary: true,
      membershipId: ID.kalakritiEditionAdminMembership,
      responsibility: "edition_admin",
    })
    .onConflictDoUpdate({
      set: { isPrimary: true },
      target: kalakritiAssignment.id,
    });

  await db
    .insert(kalakritiCenter)
    .values({
      competitionEntryRegistrationEnabled: false,
      createdAt: now,
      createdBy: adminId,
      editionId: ID.kalakritiEdition,
      id: ID.kalakritiCenter,
      name: "Jayanagar",
      normalizedName: "jayanagar",
      studentRegistrationEnabled: false,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(kalakritiAgeCategory)
    .values({
      createdAt: now,
      createdBy: adminId,
      editionId: ID.kalakritiEdition,
      id: ID.kalakritiAgeCategory,
      maxCompetitionsPerCategory: 1,
      maximumAge: 10,
      maxTotalCompetitions: 2,
      minimumAge: 6,
      name: "Junior",
      normalizedName: "junior",
      sortOrder: 0,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(kalakritiCenterAgeQuota)
    .values({
      ageCategoryId: ID.kalakritiAgeCategory,
      centerId: ID.kalakritiCenter,
      createdAt: now,
      createdBy: adminId,
      editionId: ID.kalakritiEdition,
      femaleStudentLimit: 20,
      id: ID.kalakritiCenterAgeQuota,
      maleStudentLimit: 20,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(kalakritiGuardianCenter)
    .values({
      centerId: ID.kalakritiCenter,
      createdAt: now,
      createdBy: adminId,
      editionId: ID.kalakritiEdition,
      id: ID.kalakritiGuardianCenter,
      membershipId: ID.kalakritiGuardianMembership,
    })
    .onConflictDoNothing();

  await db
    .insert(teamEventMember)
    .values({
      addedAt: now,
      eventId: ID.evKalakriti,
      id: ID.kalakritiEditionAdminEventMember,
      userId: editionAdminId,
    })
    .onConflictDoNothing();

  await db
    .insert(kalakritiAuditEntry)
    .values({
      action: "created",
      actorUserId: adminId,
      createdAt: now,
      domain: "edition",
      editionId: ID.kalakritiEdition,
      id: ID.kalakritiAudit,
      targetId: ID.kalakritiEdition,
      targetType: "edition",
    })
    .onConflictDoNothing();
  log("Kalakriti 2027 ready");
}

async function seedEventRsvp(userMap: Map<string, string>): Promise<void> {
  log("Seeding RSVP polls...");
  const leadId = getUser(userMap, "lead@pi-dash.dev");
  const v2 = getUser(userMap, "volunteer2@pi-dash.dev");
  const v3 = getUser(userMap, "volunteer3@pi-dash.dev");
  const yesOptionHash = hashPollOption("Yes");
  const noOptionHash = hashPollOption("No");

  await db
    .insert(eventRsvpPoll)
    .values([
      {
        closedAt: null,
        eventId: ID.evOutreach,
        id: ID2.rsvpPoll01,
        messageId: "3EB0SEEDOUTREACHPOLL01",
        noOptionHash,
        question: "RSVP for Community Outreach Drive on 17 Apr 2026, 10:30 am?",
        sentAt: future(4),
        targetChatJid: "120363003456789012@g.us",
        targetChatSource: "team_group",
        yesOptionHash,
      },
      {
        closedAt: null,
        eventId: ID.evTeachingNext,
        id: ID2.rsvpPoll02,
        messageId: "3EB0SEEDTEACHINGPOLL02",
        noOptionHash,
        question: "RSVP for Upcoming Teaching Session on 12 Apr 2026, 5:03 pm?",
        sentAt: past(1),
        targetChatJid: "120363001234567890@g.us",
        targetChatSource: "team_group",
        yesOptionHash,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(eventRsvpVote)
    .values([
      {
        id: ID2.rsvpVote01,
        phone: "919876543213",
        pollId: ID2.rsvpPoll01,
        selectedOption: "yes",
        selectedOptionHashes: [yesOptionHash],
        userId: v2,
        votedAt: future(4),
        voteMessageId: "3AFBSEEDRSVPVOTE001",
      },
      {
        id: ID2.rsvpVote02,
        phone: "919876543214",
        pollId: ID2.rsvpPoll01,
        selectedOption: "no",
        selectedOptionHashes: [noOptionHash],
        userId: v3,
        votedAt: future(4),
        voteMessageId: "3AFBSEEDRSVPVOTE002",
      },
      {
        id: ID2.rsvpVote03,
        phone: "919876543211",
        pollId: ID2.rsvpPoll02,
        selectedOption: "yes",
        selectedOptionHashes: [yesOptionHash],
        userId: leadId,
        votedAt: past(1),
        voteMessageId: "3AFBSEEDRSVPVOTE003",
      },
    ])
    .onConflictDoNothing();

  log("2 RSVP polls and 3 votes ready");
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
      createdAt: past(5),
      eventId: ID.evOutreach,
      id: ID.eiOutreachV3,
      message: "I'd love to help with the outreach drive!",
      reviewedAt: now,
      reviewedBy: adminId,
      status: "approved",
      userId: v3,
    })
    .onConflictDoNothing();
  await db
    .insert(eventInterest)
    .values({
      createdAt: past(2),
      eventId: ID.evOutreach,
      id: ID.eiOutreachV4,
      message: "Can I join as a photographer?",
      status: "pending",
      userId: getUser(userMap, "newbie@pi-dash.dev"),
    })
    .onConflictDoNothing();

  // Feedback
  await db
    .insert(eventFeedback)
    .values({
      content:
        "Great session! The kids were very engaged. Could use more art supplies next time.",
      createdAt: past(5),
      eventId: ID.evTeaching,
      id: ID.efTeaching,
      updatedAt: past(5),
    })
    .onConflictDoNothing();

  // Feedback submission
  await db
    .insert(eventFeedbackSubmission)
    .values({
      eventId: ID.evTeaching,
      feedbackId: ID.efTeaching,
      id: ID.efsTeachingV3,
      submittedAt: past(5),
      userId: v3,
    })
    .onConflictDoNothing();

  // Photos
  await db
    .insert(eventPhoto)
    .values({
      caption: "Kids during the drawing activity",
      createdAt: past(6),
      eventId: ID.evTeaching,
      id: ID.epTeaching1,
      r2Key: "dev/events/teaching-01.jpg",
      reviewedAt: past(5),
      reviewedBy: adminId,
      status: "approved",
      uploadedBy: leadId,
    })
    .onConflictDoNothing();
  await db
    .insert(eventPhoto)
    .values({
      caption: "Group photo at the end",
      createdAt: past(5),
      eventId: ID.evTeaching,
      id: ID.epTeaching2,
      r2Key: "dev/events/teaching-02.jpg",
      status: "pending",
      uploadedBy: v3,
    })
    .onConflictDoNothing();
  await db
    .insert(eventPhoto)
    .values({
      caption: "Highlights from the session",
      createdAt: past(5),
      eventId: ID.evTeaching,
      id: ID.epTeachingVid1,
      mimeType: "video/mp4",
      r2Key: "dev/events/teaching-highlight.mp4",
      reviewedAt: past(5),
      reviewedBy: adminId,
      status: "approved",
      uploadedBy: leadId,
    })
    .onConflictDoNothing();
  await db
    .insert(eventPhoto)
    .values({
      caption: "Opening introduction",
      createdAt: past(4),
      eventId: ID.evTeaching,
      id: ID.epTeachingVid2,
      mimeType: "video/mp4",
      r2Key: "dev/events/teaching-intro.mp4",
      status: "pending",
      uploadedBy: v3,
    })
    .onConflictDoNothing();

  // Immich albums
  await db
    .insert(eventImmichAlbum)
    .values({
      createdAt: past(5),
      eventId: ID.evTeaching,
      id: ID.eiaTeaching,
      immichAlbumId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    })
    .onConflictDoNothing();
  await db
    .insert(eventImmichAlbum)
    .values({
      createdAt: past(12),
      eventId: ID.evPlanning,
      id: ID.eiaPlanning,
      immichAlbumId: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    })
    .onConflictDoNothing();

  // Event updates
  await db
    .insert(eventUpdate)
    .values({
      content:
        "Meeting minutes: discussed Q2 goals, budget allocation, and volunteer recruitment targets.",
      createdAt: past(13),
      createdBy: adminId,
      eventId: ID.evPlanning,
      id: ID.euPlanning,
      reviewedAt: past(13),
      reviewedBy: adminId,
      status: "approved",
      updatedAt: past(13),
    })
    .onConflictDoNothing();
  await db
    .insert(eventUpdate)
    .values({
      content:
        "Reminder: please bring water bottles and sunscreen. We'll meet at the park entrance at 8 AM.",
      createdAt: past(1),
      createdBy: adminId,
      eventId: ID.evOutreach,
      id: ID.euOutreach,
      reviewedAt: past(1),
      reviewedBy: adminId,
      status: "approved",
      updatedAt: past(1),
    })
    .onConflictDoNothing();

  // Event reminder tracking (past events that already had reminders sent)
  await db
    .insert(eventReminderSent)
    .values({
      eventId: ID.evTeaching,
      id: ID.ers01,
      instanceDate: null,
      intervalMinutes: 1440,
      sentAt: subDays(past(7), 1),
    })
    .onConflictDoNothing();
  await db
    .insert(eventReminderSent)
    .values({
      eventId: ID.evTeaching,
      id: ID.ers02,
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
      city: "bangalore" as const,
      eventId: ID.evTeaching,
      expenseDate: past(10),
      historyIds: [ID.rh01, ID.rh02, ID.rh03],
      id: ID.reimb01,
      items: [
        {
          amount: "1500.00",
          cat: ID.catTravel,
          desc: "Bus pass - monthly",
          id: ID.rli01,
        },
        {
          amount: "450.00",
          cat: ID.catFood,
          desc: "Snacks for kids",
          generateVoucher: true,
          id: ID.rli02,
        },
      ],
      reviewedBy: adminId,
      status: "approved" as const,
      title: "Bus fare for teaching sessions (March)",
      userId: v1,
    },
    {
      city: "bangalore" as const,
      eventId: ID.evKitchen,
      expenseDate: past(5),
      historyIds: [ID.rh04, ID.rh05],
      id: ID.reimb02,
      items: [
        {
          amount: "2200.00",
          cat: ID.catSupplies,
          desc: "Crayons and sketch pads",
          id: ID.rli03,
        },
        {
          amount: "350.00",
          cat: ID.catSupplies,
          desc: "Chart papers",
          id: ID.rli04,
        },
      ],
      status: "pending" as const,
      title: "Art supplies purchase",
      userId: v2,
    },
    {
      city: "mumbai" as const,
      expenseDate: past(2),
      historyIds: [ID.rh06],
      id: ID.reimb03,
      items: [
        {
          amount: "5000.00",
          cat: ID.catVenue,
          desc: "Community hall deposit",
          id: ID.rli05,
        },
      ],
      status: "pending" as const,
      title: "Venue booking deposit",
      userId: leadId,
    },
    {
      city: "bangalore" as const,
      expenseDate: past(20),
      historyIds: [ID.rh07, ID.rh08],
      id: ID.reimb04,
      items: [
        {
          amount: "300.00",
          cat: ID.catTravel,
          desc: "Auto to wholesale market",
          id: ID.rli06,
        },
      ],
      rejectionReason: "Please submit with receipt",
      reviewedBy: adminId,
      status: "rejected" as const,
      title: "Auto fare for supply pickup",
      userId: v1,
    },
  ];

  await Promise.all(
    reimbursements.map(async (r) => {
      await db
        .insert(reimbursement)
        .values({
          bankAccountIfscCode: "SBIN0001234",
          bankAccountName: "Savings Account",
          bankAccountNumber: "1234567890",
          city: r.city,
          createdAt: subDays(r.expenseDate, 2),
          eventId: r.eventId,
          expenseDate: r.expenseDate.toISOString().slice(0, 10),
          id: r.id,
          rejectionReason: r.rejectionReason,
          reviewedAt: r.reviewedBy ? past(1) : null,
          reviewedBy: r.reviewedBy,
          status: r.status,
          submittedAt: subDays(r.expenseDate, 1),
          title: r.title,
          updatedAt: now,
          userId: r.userId,
        })
        .onConflictDoNothing();

      await Promise.all(
        r.items.entries().map(async ([i, item]) => {
          await db
            .insert(reimbursementLineItem)
            .values({
              amount: item.amount,
              categoryId: item.cat,
              createdAt: now,
              description: item.desc,
              generateVoucher: item.generateVoucher ?? false,
              id: item.id,
              reimbursementId: r.id,
              sortOrder: i,
              updatedAt: now,
            })
            .onConflictDoNothing();
        })
      );

      // History entries
      interface HistoryEntry {
        action: "created" | "submitted" | "approved" | "rejected";
        actorId: string;
        createdAt: Date;
        id: string;
        note?: string;
      }
      const [firstHistoryId] = r.historyIds;
      if (!firstHistoryId) {
        return;
      }
      const historyEntries: HistoryEntry[] = [
        {
          action: "created",
          actorId: r.userId,
          createdAt: subDays(r.expenseDate, 2),
          id: firstHistoryId,
        },
      ];

      if (r.historyIds[1]) {
        historyEntries.push({
          action: "submitted",
          actorId: r.userId,
          createdAt: subDays(r.expenseDate, 1),
          id: r.historyIds[1],
        });
      }

      if (
        (r.status === "approved" || r.status === "rejected") &&
        r.reviewedBy &&
        r.historyIds[2]
      ) {
        historyEntries.push({
          action: r.status,
          actorId: r.reviewedBy,
          createdAt: past(1),
          id: r.historyIds[2],
          note: r.rejectionReason,
        });
      }

      await Promise.all(
        historyEntries.map(async (h) => {
          await db
            .insert(reimbursementHistory)
            .values({
              action: h.action,
              actorId: h.actorId,
              createdAt: h.createdAt,
              id: h.id,
              note: h.note,
              reimbursementId: r.id,
            })
            .onConflictDoNothing();
        })
      );
    })
  );

  // Attachments
  await db
    .insert(reimbursementAttachment)
    .values({
      createdAt: past(9),
      filename: "bus-pass-receipt.pdf",
      id: ID.ra01,
      mimeType: "application/pdf",
      objectKey: "dev/reimbursements/bus-pass-receipt.pdf",
      reimbursementId: ID.reimb01,
      type: "file",
    })
    .onConflictDoNothing();
  await db
    .insert(reimbursementAttachment)
    .values({
      createdAt: past(9),
      filename: "Online receipt link",
      id: ID.ra02,
      reimbursementId: ID.reimb01,
      type: "url",
      url: "https://example.com/receipt-verification/12345",
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
      bankAccountIfscCode: "HDFC0002345",
      bankAccountName: "Priya Savings",
      bankAccountNumber: "2001200034005601",
      city: "bangalore",
      createdAt: past(7),
      id: ID.adv01,
      reviewedAt: past(3),
      reviewedBy: adminId,
      status: "approved",
      submittedAt: past(5),
      title: "Advance for community hall booking",
      updatedAt: past(3),
      userId: leadId,
    })
    .onConflictDoNothing();

  await db
    .insert(advancePaymentLineItem)
    .values({
      advancePaymentId: ID.adv01,
      amount: "10000.00",
      categoryId: ID.catVenue,
      createdAt: past(7),
      description: "Hall booking advance (50%)",
      id: ID.advLi01,
      sortOrder: 0,
      updatedAt: past(7),
    })
    .onConflictDoNothing();
  await db
    .insert(advancePaymentLineItem)
    .values({
      advancePaymentId: ID.adv01,
      amount: "3000.00",
      categoryId: ID.catEquipment,
      createdAt: past(7),
      description: "Sound system rental deposit",
      id: ID.advLi02,
      sortOrder: 1,
      updatedAt: past(7),
    })
    .onConflictDoNothing();

  // Attachment
  await db
    .insert(advancePaymentAttachment)
    .values({
      advancePaymentId: ID.adv01,
      createdAt: past(6),
      filename: "hall-booking-confirmation.pdf",
      id: ID.advA01,
      mimeType: "application/pdf",
      objectKey: "dev/advances/hall-booking-confirmation.pdf",
      type: "file",
    })
    .onConflictDoNothing();

  // History
  await Promise.all(
    [
      { action: "created" as const, actor: leadId, at: past(7), id: ID.advH01 },
      {
        action: "submitted" as const,
        actor: leadId,
        at: past(5),
        id: ID.advH02,
      },
      {
        action: "approved" as const,
        actor: adminId,
        at: past(3),
        id: ID.advH03,
      },
    ].map(async (h) => {
      await db
        .insert(advancePaymentHistory)
        .values({
          action: h.action,
          actorId: h.actor,
          advancePaymentId: ID.adv01,
          createdAt: h.at,
          id: h.id,
        })
        .onConflictDoNothing();
    })
  );

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
      address: "42 MG Road, Bangalore",
      bankAccountIfscCode: "HDFC0007890",
      bankAccountName: "QuickPrint Solutions",
      bankAccountNumber: "7771234567890",
      contactEmail: "info@quickprint.dev",
      contactPhone: "+919800011122",
      createdAt: past(60),
      createdBy: leadId,
      gstNumber: "29AABCQ1234F1ZA",
      id: ID2.vendor01,
      name: "QuickPrint Solutions",
      status: "approved",
      updatedAt: past(55),
    })
    .onConflictDoNothing();

  // Vendor 2 — Pending
  await db
    .insert(vendor)
    .values({
      address: "15 Food Street, Bangalore",
      bankAccountIfscCode: "ICIC0008901",
      bankAccountName: "Fresh Kitchen Caterers",
      bankAccountNumber: "8881234567891",
      contactEmail: "orders@freshkitchen.dev",
      contactPhone: "+919800033344",
      createdAt: past(5),
      createdBy: v1,
      id: ID2.vendor02,
      name: "Fresh Kitchen Caterers",
      panNumber: "AABCF1234G",
      status: "pending",
      updatedAt: past(5),
    })
    .onConflictDoNothing();

  // Vendor Payment 1 — partially paid
  await db
    .insert(vendorPayment)
    .values({
      city: "bangalore",
      createdAt: past(15),
      eventId: ID.evOutreach,
      id: ID2.vp01,
      reviewedAt: past(12),
      reviewedBy: adminId,
      status: "partially_paid",
      submittedAt: past(14),
      title: "Banner printing for outreach event",
      updatedAt: past(8),
      userId: leadId,
      vendorId: ID2.vendor01,
    })
    .onConflictDoNothing();

  await db
    .insert(vendorPaymentLineItem)
    .values({
      amount: "8500.00",
      categoryId: ID.catPrinting,
      createdAt: past(15),
      description: "10 vinyl banners (6x3 ft)",
      id: ID2.vpLi01,
      sortOrder: 0,
      updatedAt: past(15),
      vendorPaymentId: ID2.vp01,
    })
    .onConflictDoNothing();
  await db
    .insert(vendorPaymentLineItem)
    .values({
      amount: "2500.00",
      categoryId: ID.catPrinting,
      createdAt: past(15),
      description: "500 flyers (A5)",
      id: ID2.vpLi02,
      sortOrder: 1,
      updatedAt: past(15),
      vendorPaymentId: ID2.vp01,
    })
    .onConflictDoNothing();

  // VP1 attachments
  await db
    .insert(vendorPaymentAttachment)
    .values({
      createdAt: past(16),
      filename: "quickprint-quotation.pdf",
      id: ID2.vpA01,
      mimeType: "application/pdf",
      objectKey: "dev/vendors/quickprint-quotation.pdf",
      purpose: "quotation",
      type: "file",
      vendorPaymentId: ID2.vp01,
    })
    .onConflictDoNothing();
  await db
    .insert(vendorPaymentAttachment)
    .values({
      createdAt: past(11),
      filename: "quickprint-invoice-001.pdf",
      id: ID2.vpA02,
      mimeType: "application/pdf",
      objectKey: "dev/vendors/quickprint-invoice-001.pdf",
      purpose: "invoice",
      type: "file",
      vendorPaymentId: ID2.vp01,
    })
    .onConflictDoNothing();

  // VP1 history
  await Promise.all(
    [
      {
        action: "created" as const,
        actor: leadId,
        at: past(15),
        id: ID2.vpH01,
      },
      {
        action: "submitted" as const,
        actor: leadId,
        at: past(14),
        id: ID2.vpH02,
      },
      {
        action: "approved" as const,
        actor: adminId,
        at: past(12),
        id: ID2.vpH03,
      },
    ].map(async (h) => {
      await db
        .insert(vendorPaymentHistory)
        .values({
          action: h.action,
          actorId: h.actor,
          createdAt: h.at,
          id: h.id,
          vendorPaymentId: ID2.vp01,
        })
        .onConflictDoNothing();
    })
  );

  // Transaction for VP1
  await db
    .insert(vendorPaymentTransaction)
    .values({
      amount: "5000.00",
      createdAt: past(10),
      description: "First installment via NEFT",
      id: ID2.vpt01,
      paymentMethod: "NEFT",
      paymentReference: "NEFT-REF-001",
      reviewedAt: past(9),
      reviewedBy: adminId,
      status: "approved",
      transactionDate: past(10),
      updatedAt: past(9),
      userId: adminId,
      vendorPaymentId: ID2.vp01,
    })
    .onConflictDoNothing();

  await db
    .insert(vendorPaymentTransactionAttachment)
    .values({
      createdAt: past(9),
      filename: "neft-confirmation.png",
      id: ID2.vptA01,
      mimeType: "image/png",
      objectKey: "dev/transactions/neft-confirmation.png",
      type: "file",
      vendorPaymentTransactionId: ID2.vpt01,
    })
    .onConflictDoNothing();

  await Promise.all(
    [
      {
        action: "created" as const,
        actor: adminId,
        at: past(10),
        id: ID2.vptH01,
      },
      {
        action: "approved" as const,
        actor: adminId,
        at: past(9),
        id: ID2.vptH02,
      },
    ].map(async (h) => {
      await db
        .insert(vendorPaymentTransactionHistory)
        .values({
          action: h.action,
          actorId: h.actor,
          createdAt: h.at,
          id: h.id,
          vendorPaymentTransactionId: ID2.vpt01,
        })
        .onConflictDoNothing();
    })
  );

  // Vendor Payment 2 — pending
  await db
    .insert(vendorPayment)
    .values({
      city: "mumbai",
      createdAt: past(3),
      id: ID2.vp02,
      status: "pending",
      submittedAt: past(2),
      title: "Catering for weekend seva",
      updatedAt: past(2),
      userId: v1,
      vendorId: ID2.vendor02,
    })
    .onConflictDoNothing();
  await db
    .insert(vendorPaymentLineItem)
    .values({
      amount: "15000.00",
      categoryId: ID.catFood,
      createdAt: past(3),
      description: "Lunch for 50 people",
      id: ID2.vpLi03,
      sortOrder: 0,
      updatedAt: past(3),
      vendorPaymentId: ID2.vp02,
    })
    .onConflictDoNothing();
  await Promise.all(
    [
      { action: "created" as const, actor: v1, at: past(3), id: ID2.vpH04 },
      { action: "submitted" as const, actor: v1, at: past(2), id: ID2.vpH05 },
    ].map(async (h) => {
      await db
        .insert(vendorPaymentHistory)
        .values({
          action: h.action,
          actorId: h.actor,
          createdAt: h.at,
          id: h.id,
          vendorPaymentId: ID2.vp02,
        })
        .onConflictDoNothing();
    })
  );

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
      createdAt: past(4),
      createdBy: leadId,
      id: ID2.sm01,
      message:
        "Reminder: Weekly teaching session tomorrow at 10 AM. Please confirm attendance.",
      scheduledAt: past(2),
      updatedAt: past(2),
    })
    .onConflictDoNothing();
  await db
    .insert(scheduledMessageRecipient)
    .values({
      createdAt: past(4),
      id: ID2.smr01,
      label: "Teaching Team",
      recipientId: ID.waTeaching,
      retryCount: 0,
      scheduledMessageId: ID2.sm01,
      sentAt: past(2),
      status: "sent",
      type: "group",
      updatedAt: past(2),
    })
    .onConflictDoNothing();
  await db
    .insert(scheduledMessageRecipient)
    .values({
      createdAt: past(4),
      id: ID2.smr02,
      label: "Event Coordinators",
      recipientId: ID.waCoordinators,
      retryCount: 0,
      scheduledMessageId: ID2.sm01,
      sentAt: past(2),
      status: "sent",
      type: "group",
      updatedAt: past(2),
    })
    .onConflictDoNothing();

  // Message 2 — future, pending, with attachment
  await db
    .insert(scheduledMessage)
    .values({
      attachments: [
        {
          fileName: "schedule-april.pdf",
          mimeType: "application/pdf",
          r2Key: "dev/messages/schedule-april.pdf",
        },
      ],
      createdAt: past(1),
      createdBy: adminId,
      id: ID2.sm02,
      message:
        "Hi! Please find the updated volunteer schedule for next month attached.",
      scheduledAt: future(3),
      updatedAt: past(1),
    })
    .onConflictDoNothing();
  await db
    .insert(scheduledMessageRecipient)
    .values({
      createdAt: past(1),
      id: ID2.smr03,
      label: "Rahul Verma",
      recipientId: v1,
      retryCount: 0,
      scheduledMessageId: ID2.sm02,
      status: "pending",
      type: "user",
      updatedAt: past(1),
    })
    .onConflictDoNothing();
  await db
    .insert(scheduledMessageRecipient)
    .values({
      createdAt: past(1),
      id: ID2.smr04,
      label: "Kitchen Duty",
      recipientId: ID.waKitchen,
      retryCount: 0,
      scheduledMessageId: ID2.sm02,
      status: "pending",
      type: "group",
      updatedAt: past(1),
    })
    .onConflictDoNothing();

  // Message 3 — past, mixed statuses
  await db
    .insert(scheduledMessage)
    .values({
      createdAt: past(3),
      createdBy: adminId,
      id: ID2.sm03,
      message:
        "Important: Venue change for Saturday's event. New location: Cubbon Park entrance gate 2.",
      scheduledAt: past(1),
      updatedAt: past(1),
    })
    .onConflictDoNothing();
  await db
    .insert(scheduledMessageRecipient)
    .values({
      createdAt: past(3),
      id: ID2.smr05,
      label: "Weekend Seva",
      recipientId: ID.waWeekend,
      retryCount: 0,
      scheduledMessageId: ID2.sm03,
      sentAt: past(1),
      status: "sent",
      type: "group",
      updatedAt: past(1),
    })
    .onConflictDoNothing();
  await db
    .insert(scheduledMessageRecipient)
    .values({
      createdAt: past(3),
      error: "User phone number not registered on WhatsApp",
      id: ID2.smr06,
      label: "Priya Sharma",
      recipientId: leadId,
      retryCount: 2,
      scheduledMessageId: ID2.sm03,
      status: "failed",
      type: "user",
      updatedAt: past(1),
    })
    .onConflictDoNothing();
  await db
    .insert(scheduledMessageRecipient)
    .values({
      createdAt: past(3),
      id: ID2.smr07,
      label: "Teaching Team",
      recipientId: ID.waTeaching,
      retryCount: 0,
      scheduledMessageId: ID2.sm03,
      status: "cancelled",
      type: "group",
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
      emailEnabled: true,
      topicId: "Requests - New Submissions",
      userId: adminId,
      whatsappEnabled: false,
    },
    {
      emailEnabled: false,
      topicId: "Events - Schedule",
      userId: v1,
      whatsappEnabled: true,
    },
    {
      emailEnabled: false,
      topicId: "Events - Photos",
      userId: v1,
      whatsappEnabled: false,
    },
    {
      emailEnabled: true,
      topicId: "Teams",
      userId: v2,
      whatsappEnabled: false,
    },
  ];

  await db
    .insert(notificationTopicPreference)
    .values(prefs)
    .onConflictDoNothing();
  log(`${prefs.length} notification preferences seeded`);
}

// ── 13a. Notifications ──────────────────────────────────────────────────────

async function seedNotifications(userMap: Map<string, string>): Promise<void> {
  log("Seeding notifications...");
  const adminId = getUser(userMap, "admin@pi-dash.dev");
  const v1 = getUser(userMap, "volunteer1@pi-dash.dev");

  const rows = [
    {
      archived: false,
      body: 'Volunteer 1 submitted "Office supplies"',
      clickAction: "/reimbursements",
      createdAt: past(1),
      id: uuidv7(),
      idempotencyKey: "seed-notif-1",
      read: false,
      title: "👀 New reimbursement to review",
      topicId: "Requests - New Submissions",
      userId: adminId,
    },
    {
      archived: false,
      body: "A new event has been created for next Saturday",
      clickAction: "/events",
      createdAt: past(3),
      id: uuidv7(),
      idempotencyKey: "seed-notif-2",
      read: true,
      title: "📅 New event: Beach Cleanup",
      topicId: "Events - Schedule",
      userId: v1,
    },
    {
      archived: false,
      body: "Welcome to the team, Volunteer 1!",
      clickAction: "/",
      createdAt: past(7),
      id: uuidv7(),
      idempotencyKey: "seed-notif-3",
      read: true,
      title: "🎉 Welcome aboard!",
      topicId: "Account Notifications",
      userId: v1,
    },
  ];

  await db.insert(notification).values(rows).onConflictDoNothing();
  log(`${rows.length} notifications seeded`);
}

// ── 14. App Config ───────────────────────────────────────────────────────────

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
      configs.map((c) => ({ key: c.key, updatedAt: now, value: c.value }))
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
  await seedKalakriti(userMap);
  await seedEventRsvp(userMap);
  await seedEventExtras(userMap);
  await seedReimbursements(userMap);
  await seedAdvancePayments(userMap);
  await seedVendors(userMap);
  await seedScheduledMessages(userMap);
  await seedNotificationPreferences(userMap);
  await seedNotifications(userMap);
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
