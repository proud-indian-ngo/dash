import { createHash } from "node:crypto";
/**
 * Comprehensive dev seed — covers all data models with realistic data.
 * Fully idempotent: safe to run multiple times without creating duplicates.
 *
 * Usage:
 *   bun run seed          (from repo root)
 *
 * Seeded tables:
 *   user, account (auto-created by auth.api.createUser), notificationTopicPreference,
 *   emailSuppression,
 *   auditLog,
 *   role, permission, rolePermission (via syncPermissions),
 *   appConfig, whatsappGroup,
 *   team, teamMember, teamEvent, teamEventMember, eventRsvpPoll, eventRsvpVote,
 *   eventInterest, eventFeedback, eventFeedbackSubmission,
 *   eventPhoto, eventImmichAlbum, eventUpdate,
 *   eventPartner, socialPost, socialRun, socialApiToken,
 *   expenseCategory, bankAccount,
 *   programme, costCentre, fund, fiscalYear, fiscalPeriod, party, partyRole, partyPrivate,
 *   orgAccount, contribution, contributionRefund, otherIncome,
 *   gatewaySettlement, gatewaySettlementItem,
 *   importBatch, importRow, externalIdentity, collectionEvent, statementLine,
 *   reimbursement, reimbursementLineItem, reimbursementAttachment, reimbursementHistory,
 *   advancePayment, advancePaymentLineItem, advancePaymentAttachment, advancePaymentHistory,
 *   vendor, vendorPayment, vendorPaymentLineItem, vendorPaymentAttachment, vendorPaymentHistory,
 *   vendorPaymentTransaction, vendorPaymentTransactionAttachment, vendorPaymentTransactionHistory,
 *   notification,
 *   scheduledMessage, scheduledMessageRecipient
 */

import { auth } from "@pi-dash/auth";
import { db } from "@pi-dash/db";
import { importedRowRetention } from "@pi-dash/db/import-retention";
import {
  advancePayment,
  advancePaymentAttachment,
  advancePaymentHistory,
  advancePaymentLineItem,
} from "@pi-dash/db/schema/advance-payment";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { auditLog } from "@pi-dash/db/schema/audit-log";
import { notificationTopicPreference, user } from "@pi-dash/db/schema/auth";
import { bankAccount } from "@pi-dash/db/schema/bank-account";
import {
  eventFeedback,
  eventFeedbackSubmission,
} from "@pi-dash/db/schema/event-feedback";
import { eventInterest } from "@pi-dash/db/schema/event-interest";
import { eventPartner } from "@pi-dash/db/schema/event-partner";
import { eventImmichAlbum, eventPhoto } from "@pi-dash/db/schema/event-photo";
import { eventReminderSent } from "@pi-dash/db/schema/event-reminder";
import { eventRsvpPoll, eventRsvpVote } from "@pi-dash/db/schema/event-rsvp";
import { eventUpdate } from "@pi-dash/db/schema/event-update";
import { expenseCategory } from "@pi-dash/db/schema/expense-category";
import { orgAccount } from "@pi-dash/db/schema/finance-dimensions";
import {
  gatewaySettlement,
  gatewaySettlementItem,
} from "@pi-dash/db/schema/gateway-settlement";
import { importBatch } from "@pi-dash/db/schema/import-batch";
import {
  contribution,
  contributionRefund,
  otherIncome,
} from "@pi-dash/db/schema/income";
import {
  kalakritiAgeCategory,
  kalakritiAssignment,
  kalakritiAuditEntry,
  kalakritiAttendee,
  kalakritiJudgeAssignment,
  kalakritiCenter,
  kalakritiCenterScanStage,
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiCompetitionDivision,
  kalakritiCompetitionEntry,
  kalakritiCompetitionSession,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiEntryMember,
  kalakritiEntryMusic,
  kalakritiExternalIdentity,
  kalakritiGuardianCenter,
  kalakritiOperation,
  kalakritiStudent,
  kalakritiTransportAssignment,
  kalakritiTransportStatusHistory,
  kalakritiVenue,
} from "@pi-dash/db/schema/kalakriti";
import {
  kalakritiAwardCommand,
  kalakritiAwardHandover,
} from "@pi-dash/db/schema/kalakriti-awards";
import {
  kalakritiInventoryItem,
  kalakritiInventoryTransaction,
} from "@pi-dash/db/schema/kalakriti-inventory";
import {
  kalakritiResult,
  kalakritiResultRevision,
  kalakritiResultScorecard,
  kalakritiResultsState,
} from "@pi-dash/db/schema/kalakriti-results";
import { notification } from "@pi-dash/db/schema/notification";
import { party, partyRole } from "@pi-dash/db/schema/party";
import { emailSuppression } from "@pi-dash/db/schema/private/email-suppression";
import {
  collectionEvent,
  externalIdentity,
  importRow,
} from "@pi-dash/db/schema/private/imports";
import { partyPrivate } from "@pi-dash/db/schema/private/party-private";
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
import { socialApiToken } from "@pi-dash/db/schema/social-api-token";
import { socialPost } from "@pi-dash/db/schema/social-post";
import { socialRun } from "@pi-dash/db/schema/social-run";
import { statementLine } from "@pi-dash/db/schema/statement-line";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import {
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
import { ensureFinanceDimensions } from "@pi-dash/db/seed-finance-dimensions";
import { ensureVendor } from "@pi-dash/db/seed-vendors";
import { syncPermissions } from "@pi-dash/db/sync-permissions";
import {
  GENERAL_FUND_ID,
  GIVE_INDIA_PARTY_ID,
  GIVE_INDIA_PARTY_NAME,
  PROGRAMME_IDS,
} from "@pi-dash/shared/constants";
import { getKalakritiCenterTransportStatus } from "@pi-dash/zero/kalakriti-center-scan-rules";
import { and, eq, isNull, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { shouldSeedDevSocialToken } from "./seed-social-token";

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

function plateTextContent(text: string): string {
  return JSON.stringify([{ children: [{ text }], type: "p" }]);
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
  audit01: "019d52c2-7261-7dce-b0ee-e20000000001",
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
  kalakritiCompetition: "019d52c2-7261-7dce-b0ee-e206561715cb",
  kalakritiCompetitionCategory: "019d52c2-7261-7dce-b0ee-e206561715ca",
  kalakritiCompetitionEntry: "019d52c2-7261-7dce-b0ee-e206561715d0",
  kalakritiCompetitionSession: "019d52c2-7261-7dce-b0ee-e206561715cd",
  kalakritiEdition: "019d52c2-7261-7dce-b0ee-e206561715c0",
  kalakritiEditionAdminAssignment: "019d52c2-7261-7dce-b0ee-e206561715c3",
  kalakritiEditionAdminEventMember: "019d52c2-7261-7dce-b0ee-e206561715c5",
  kalakritiEditionAdminMembership: "019d52c2-7261-7dce-b0ee-e206561715c1",
  kalakritiEntryMember: "019d52c2-7261-7dce-b0ee-e206561715d1",
  kalakritiGuardianCenter: "019d52c2-7261-7dce-b0ee-e206561715c7",
  kalakritiGuardianMembership: "019d52c2-7261-7dce-b0ee-e206561715c2",
  kalakritiStudent: "019d52c2-7261-7dce-b0ee-e206561715ce",
  kalakritiOperation: "01a082b2-b262-78ea-9ba4-bda73e9fc51c",
  kalakritiTransportAssignment: "01a084cd-40f8-74e2-a692-a014548a34e7",
  kalakritiTransportHistory: "01a084cd-40f9-7eb4-ba8c-24e46aed65ba",
  kalakritiInventoryItem: "01a0aa0d-adf1-7bf6-a245-e0dcd8c99efc",
  kalakritiInventoryTransaction: "01a0aa0d-adf1-7bf6-a245-e0dd216b94c7",
  kalakritiCenterScanStage: "01a084cd-40fa-7ee8-bd59-fc3523adf031",
  kalakritiVenue: "019d52c2-7261-7dce-b0ee-e206561715cc",
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
  // Social API
  socialPartnerEthos: "019d52c2-7261-7dce-b0ee-e270a1b2c3d4",
  socialPartnerNss: "019d52c2-7261-7dce-b0ee-e271b2c3d4e5",
  socialPost01: "019d52c2-7261-7dce-b0ee-e272c3d4e5f6",
  socialRun01: "019d52c2-7261-7dce-b0ee-e274e5f60718",
  socialToken01: "019d52c2-7261-7dce-b0ee-e273d4e5f607",
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
  vendor03: "019d52c3-0000-7000-8000-000000000022",
  vp01: "019d52c3-0000-7000-8000-000000000003",
  vp02: "019d52c3-0000-7000-8000-000000000004",
  vp03: "019d52c3-0000-7000-8000-000000000023",
  vpA01: "019d52c3-0000-7000-8000-000000000008",
  vpA02: "019d52c3-0000-7000-8000-000000000009",
  vpA03: "019d52c3-0000-7000-8000-000000000024",
  vpH01: "019d52c3-0000-7000-8000-00000000000a",
  vpH02: "019d52c3-0000-7000-8000-00000000000b",
  vpH03: "019d52c3-0000-7000-8000-00000000000c",
  vpH04: "019d52c3-0000-7000-8000-00000000000d",
  vpH05: "019d52c3-0000-7000-8000-00000000000e",
  vpH06: "019d52c3-0000-7000-8000-000000000025",
  vpH07: "019d52c3-0000-7000-8000-000000000026",
  vpH08: "019d52c3-0000-7000-8000-000000000027",
  vpH09: "019d52c3-0000-7000-8000-000000000028",
  vpLi01: "019d52c3-0000-7000-8000-000000000005",
  vpLi02: "019d52c3-0000-7000-8000-000000000006",
  vpLi03: "019d52c3-0000-7000-8000-000000000007",
  vpLi04: "019d52c3-0000-7000-8000-000000000029",
  // Vendor payment transaction
  vpt01: "019d52c3-0000-7000-8000-00000000000f",
  vpt02: "019d52c3-0000-7000-8000-00000000002a",
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

async function seedAuditLog(userMap: Map<string, string>): Promise<void> {
  log("Seeding audit log...");
  const actorUserId = getUser(userMap, "admin@pi-dash.dev");
  await db
    .insert(auditLog)
    .values({
      action: "seed.completed",
      actorName: "Dev Admin",
      actorRole: "super_admin",
      actorUserId,
      attemptedAt: now,
      completedAt: now,
      id: ID.audit01,
      metadata: { source: "development_seed" },
      outcome: "success",
      targetType: "system",
    })
    .onConflictDoNothing();
  log("1 audit entry ready");
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

/** Programme each seeded team belongs to; seeded events inherit it. */
const TEAM_PROGRAMME: Record<string, string> = {
  [ID.teamEvents]: PROGRAMME_IDS.communitySupport,
  [ID.teamKitchen]: PROGRAMME_IDS.communitySupport,
  [ID.teamLogistics]: PROGRAMME_IDS.communitySupport,
  [ID.teamTeaching]: PROGRAMME_IDS.education,
};

// ── 2b. Finance dimensions ───────────────────────────────────────────────────

/** Mirrors migration 0112 so a fresh dev database and production agree. */
async function seedFinanceDimensions(): Promise<void> {
  log("Seeding finance dimensions...");
  await ensureFinanceDimensions();
  log("Finance dimensions ready");
}

// ── 2c. Parties ──────────────────────────────────────────────────────────────

const PARTIES = [
  {
    displayName: "Asha Rao",
    id: "01930000-0000-7000-8000-000000000501",
    kind: "person" as const,
    roleId: "01930000-0000-7000-8000-000000000511",
    roles: ["donor"] as const,
  },
  {
    displayName: "Goodera",
    id: "01930000-0000-7000-8000-000000000502",
    kind: "organisation" as const,
    legalName: "Goodera Technologies Private Limited",
    roleId: "01930000-0000-7000-8000-000000000512",
    roles: ["intermediary"] as const,
  },
  // Donations return fixtures: a donor who doesn't want a tax certificate
  // (left out of the return, but name and address still needed) and one
  // without an address (listed under "Missing donor details").
  {
    displayName: "Kiran Mehta",
    id: "01930000-0000-7000-8000-000000000503",
    kind: "person" as const,
    roleId: "01930000-0000-7000-8000-000000000513",
    roles: ["donor"] as const,
    taxCertificateOptOut: true,
  },
  {
    displayName: "Ravi Kumar",
    id: "01930000-0000-7000-8000-000000000504",
    kind: "person" as const,
    roleId: "01930000-0000-7000-8000-000000000514",
    roles: ["donor"] as const,
  },
  // The intermediary of every give.do contribution; the first give.do import creates it in production.
  {
    displayName: GIVE_INDIA_PARTY_NAME,
    id: GIVE_INDIA_PARTY_ID,
    kind: "organisation" as const,
    roleId: "01930000-0000-7000-8000-000000000411",
    roles: ["intermediary"] as const,
  },
];

const OPTED_OUT_DONOR_ID = "01930000-0000-7000-8000-000000000503";
const NO_ADDRESS_DONOR_ID = "01930000-0000-7000-8000-000000000504";

/** Identity rows only; contact and ID details are entered through the app. */
async function seedParties(adminId: string): Promise<void> {
  log("Seeding parties...");
  await db
    .insert(party)
    .values(
      PARTIES.map((p) => ({
        createdAt: now,
        createdBy: adminId,
        displayName: p.displayName,
        id: p.id,
        kind: p.kind,
        legalName: "legalName" in p ? p.legalName : null,
        taxCertificateOptOut:
          "taxCertificateOptOut" in p ? p.taxCertificateOptOut : false,
        updatedAt: now,
      }))
    )
    .onConflictDoNothing();
  await db
    .insert(partyRole)
    .values(
      PARTIES.map((p) => ({
        active: true,
        id: p.roleId,
        partyId: p.id,
        role: p.roles[0],
        since: now,
      }))
    )
    .onConflictDoNothing();
  // Contact details without an identifier, so the seed works without DATA_ENCRYPTION_KEY.
  await db
    .insert(partyPrivate)
    .values([
      {
        city: "Bengaluru",
        email: "asha.rao@example.test",
        partyId: PARTIES[0]?.id as string,
        state: "Karnataka",
        updatedAt: now,
        updatedBy: adminId,
      },
      // Opted out: has an address, no ID number, and is not asked for one.
      {
        addressLine1: "14 Residency Road",
        city: "Bengaluru",
        email: "kiran.mehta@example.test",
        partyId: OPTED_OUT_DONOR_ID,
        pincode: "560025",
        state: "Karnataka",
        updatedAt: now,
        updatedBy: adminId,
      },
      // No address: blocks the donations return.
      {
        email: "ravi.kumar@example.test",
        partyId: NO_ADDRESS_DONOR_ID,
        updatedAt: now,
        updatedBy: adminId,
      },
    ])
    .onConflictDoNothing();
  log(`${PARTIES.length} parties ready`);
}

// ── 2d. Income ───────────────────────────────────────────────────────────────

/** Dev-only organisation accounts; production accounts are set up by finance. */
const ORG_ACCOUNTS = [
  {
    id: "01930000-0000-7000-8000-000000000601",
    kind: "bank" as const,
    name: "HDFC current account",
  },
  {
    id: "01930000-0000-7000-8000-000000000602",
    kind: "gateway_clearing" as const,
    name: "Razorpay clearing",
  },
  {
    id: "01930000-0000-7000-8000-000000000604",
    kind: "gateway_clearing" as const,
    name: "give.do clearing",
  },
  {
    id: "01930000-0000-7000-8000-000000000603",
    kind: "cash" as const,
    name: "Petty cash",
  },
];

const DONOR_ID = PARTIES[0]?.id as string;

const CONTRIBUTIONS = [
  {
    amountPaise: 100_000,
    channel: "give_do" as const,
    gatewayFeePaise: 5000,
    id: "01930000-0000-7000-8000-000000000650",
    intermediaryPartyId: GIVE_INDIA_PARTY_ID,
    orgAccountId: ORG_ACCOUNTS[2]?.id,
    programmeId: PROGRAMME_IDS.education,
    receivedOn: "2026-09-01",
    reference: null,
    reportingMode: "electronic_or_account_payee" as const,
    source: "import" as const,
  },
  {
    amountPaise: 2_500_000,
    channel: "neft" as const,
    id: "01930000-0000-7000-8000-000000000611",
    orgAccountId: ORG_ACCOUNTS[0]?.id,
    programmeId: PROGRAMME_IDS.education,
    receivedOn: "2026-05-12",
    reference: "UTR-SEED-0001",
    reportingMode: "electronic_or_account_payee" as const,
  },
  {
    amountPaise: 500_000,
    channel: "razorpay" as const,
    id: "01930000-0000-7000-8000-000000000612",
    orgAccountId: ORG_ACCOUNTS[1]?.id,
    programmeId: null,
    receivedOn: "2026-08-15",
    reference: "pay_SEED0002",
    reportingMode: "electronic_or_account_payee" as const,
  },
  {
    amountPaise: 200_000,
    channel: "cash" as const,
    id: "01930000-0000-7000-8000-000000000613",
    orgAccountId: ORG_ACCOUNTS[2]?.id,
    programmeId: PROGRAMME_IDS.communitySupport,
    receivedOn: "2025-12-20",
    reference: null,
    reportingMode: "cash" as const,
  },
];

/** One gift each from the donations return fixtures, this financial year. */
const RETURN_FIXTURE_CONTRIBUTIONS = [
  {
    amountPaise: 1_000_000,
    channel: "upi" as const,
    id: "01930000-0000-7000-8000-000000000615",
    orgAccountId: ORG_ACCOUNTS[0]?.id,
    partyId: OPTED_OUT_DONOR_ID,
    programmeId: null,
    receivedOn: "2026-07-04",
    reference: "UTR-SEED-0015",
    reportingMode: "electronic_or_account_payee" as const,
  },
  {
    amountPaise: 300_000,
    channel: "neft" as const,
    id: "01930000-0000-7000-8000-000000000616",
    orgAccountId: ORG_ACCOUNTS[0]?.id,
    partyId: NO_ADDRESS_DONOR_ID,
    programmeId: PROGRAMME_IDS.education,
    receivedOn: "2026-09-10",
    reference: "UTR-SEED-0016",
    reportingMode: "electronic_or_account_payee" as const,
  },
];

async function seedIncome(adminId: string): Promise<void> {
  log("Seeding income...");
  await db
    .insert(orgAccount)
    .values(ORG_ACCOUNTS.map((a) => ({ ...a, createdAt: now, updatedAt: now })))
    .onConflictDoNothing();
  // Dev only: Razorpay payments land in the seeded clearing account once
  // RAZORPAY_KEY_ID and RAZORPAY_WEBHOOK_SECRET are set.
  await db
    .insert(appConfig)
    .values({
      key: "razorpay_clearing_account_id",
      updatedAt: now,
      value: ORG_ACCOUNTS[1]?.id as string,
    })
    .onConflictDoNothing();
  await db
    .insert(contribution)
    .values(
      CONTRIBUTIONS.map((c) => ({
        ...c,
        createdAt: now,
        createdBy: adminId,
        fundId: GENERAL_FUND_ID,
        orgAccountId: c.orgAccountId ?? null,
        partyId: DONOR_ID,
        updatedAt: now,
      }))
    )
    .onConflictDoNothing();
  await db
    .insert(contribution)
    .values(
      RETURN_FIXTURE_CONTRIBUTIONS.map((c) => ({
        ...c,
        createdAt: now,
        createdBy: adminId,
        fundId: GENERAL_FUND_ID,
        orgAccountId: c.orgAccountId ?? null,
        updatedAt: now,
      }))
    )
    .onConflictDoNothing();
  // A partial refund of the Razorpay gift, so the Income table shows
  // "Partly refunded" and its sheet lists the refund.
  await db
    .insert(contributionRefund)
    .values({
      amountPaise: 100_000,
      contributionId: "01930000-0000-7000-8000-000000000612",
      createdAt: now,
      id: "01930000-0000-7000-8000-000000000614",
      reference: "rfnd_SEED0002",
      refundedOn: "2026-08-20",
      source: "razorpay",
    })
    .onConflictDoNothing();
  // A Razorpay settlement (test mode) that paid out the Razorpay gift less
  // its refund, so Income → Settlements has a row and a breakdown.
  await db
    .insert(gatewaySettlement)
    .values({
      amountPaise: 400_000,
      createdAt: now,
      externalId: "setl_SEED0001",
      feesPaise: 0,
      grossPaise: 500_000,
      paymentCount: 1,
      refundsPaise: 100_000,
      id: "01930000-0000-7000-8000-000000000631",
      itemCount: 2,
      orgAccountId: ORG_ACCOUNTS[1]?.id as string,
      provider: "razorpay",
      providerAccount: "test",
      settledOn: "2026-08-21",
      status: "processed",
      taxPaise: 0,
      updatedAt: now,
      utr: "SEEDUTR0001",
    })
    .onConflictDoNothing();
  await db
    .insert(gatewaySettlementItem)
    .values([
      {
        contributionId: "01930000-0000-7000-8000-000000000612",
        creditPaise: 500_000,
        externalId: "pay_SEED0002",
        id: "01930000-0000-7000-8000-000000000632",
        settledAt: new Date("2026-08-21T04:30:00Z"),
        settlementId: "01930000-0000-7000-8000-000000000631",
        type: "payment" as const,
      },
      {
        contributionRefundId: "01930000-0000-7000-8000-000000000614",
        debitPaise: 100_000,
        externalId: "rfnd_SEED0002",
        id: "01930000-0000-7000-8000-000000000633",
        settledAt: new Date("2026-08-21T04:30:00Z"),
        settlementId: "01930000-0000-7000-8000-000000000631",
        type: "refund" as const,
      },
    ])
    .onConflictDoNothing();
  await db
    .insert(otherIncome)
    .values({
      amountPaise: 184_250,
      createdAt: now,
      createdBy: adminId,
      description: "Savings interest, Q1",
      fundId: GENERAL_FUND_ID,
      id: "01930000-0000-7000-8000-000000000621",
      kind: "interest",
      orgAccountId: ORG_ACCOUNTS[0]?.id as string,
      receivedOn: "2026-06-30",
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(externalIdentity)
    .values({
      contributionId: "01930000-0000-7000-8000-000000000650",
      createdAt: now,
      entityType: "payment",
      externalId: "LCSEEDGIVEDO0001",
      id: "01930000-0000-7000-8000-000000000651",
      payloadHash: "seed",
      provider: "give_do",
      providerAccount: ORG_ACCOUNTS[2]?.id as string,
    })
    .onConflictDoNothing();
  await db
    .insert(gatewaySettlement)
    .values({
      amountPaise: 95_000,
      createdAt: now,
      externalId: "GIVEDOSEED202609",
      feesPaise: 5000,
      grossPaise: 100_000,
      id: "01930000-0000-7000-8000-000000000652",
      itemCount: 1,
      orgAccountId: ORG_ACCOUNTS[2]?.id as string,
      paymentCount: 1,
      provider: "give_do",
      providerAccount: "live",
      settledOn: "2026-09-05",
      status: "processed",
      taxPaise: 0,
      updatedAt: now,
      utr: "GIVEDOSEED202609",
    })
    .onConflictDoNothing();
  await db
    .insert(gatewaySettlementItem)
    .values({
      contributionId: "01930000-0000-7000-8000-000000000650",
      creditPaise: 95_000,
      externalId: "LCSEEDGIVEDO0001",
      feePaise: 5000,
      id: "01930000-0000-7000-8000-000000000653",
      settledAt: new Date("2026-09-05T00:00:00+05:30"),
      settlementId: "01930000-0000-7000-8000-000000000652",
      taxPaise: 0,
      type: "payment",
    })
    .onConflictDoNothing();
  await seedImportBatch(adminId);
  await seedStatementLines(adminId);
  log(
    `${ORG_ACCOUNTS.length} org accounts, ${CONTRIBUTIONS.length + RETURN_FIXTURE_CONTRIBUTIONS.length} contributions, 1 refund, 2 settlements, 1 other income, 1 import and ${STATEMENT_LINES.length} bank statement lines ready`
  );
}

/**
 * Lines of the HDFC account's statement, so Bank statements has one of each
 * state: the Razorpay settlement and the NEFT gift matched, a give.do payout
 * waiting as a suggestion, bank interest ignored, and an unmatched debit.
 * Synthetic: hashes are fixed seed values, not the keyed import hash.
 */
const STATEMENT_LINES = [
  {
    amountPaise: 2_500_000,
    balancePaise: 12_500_000,
    direction: "credit" as const,
    id: "01930000-0000-7000-8000-000000000641",
    matchedContributionId: "01930000-0000-7000-8000-000000000611",
    matchKind: "contribution" as const,
    matchReason: "reference",
    matchStatus: "matched" as const,
    narration: "NEFT CR-UTR-SEED-0001-ASHA RAO",
    reference: "UTR-SEED-0001",
    valueOn: "2026-05-12",
  },
  {
    amountPaise: 400_000,
    balancePaise: 12_900_000,
    direction: "credit" as const,
    id: "01930000-0000-7000-8000-000000000642",
    matchedSettlementId: "01930000-0000-7000-8000-000000000631",
    matchKind: "settlement" as const,
    matchReason: "utr",
    matchStatus: "matched" as const,
    narration: "NEFT CR-SEEDUTR0001-RAZORPAY SOFTWARE PVT LTD",
    reference: "SEEDUTR0001",
    valueOn: "2026-08-22",
  },
  {
    amountPaise: 184_250,
    balancePaise: 13_084_250,
    direction: "credit" as const,
    id: "01930000-0000-7000-8000-000000000643",
    ignoredReason: "bank_interest" as const,
    matchStatus: "ignored" as const,
    narration: "CREDIT INTEREST CAPITALISED",
    reference: null,
    valueOn: "2026-06-30",
  },
  {
    amountPaise: 750_000,
    balancePaise: 13_834_250,
    direction: "credit" as const,
    id: "01930000-0000-7000-8000-000000000644",
    matchStatus: "unmatched" as const,
    narration: "NEFT CR-GIVE INDIA FOUNDATION-PAYOUT SEP",
    reference: "GIVEINDIASEED01",
    suggestedKind: "giveindia_payout" as const,
    suggestionReason: "giveindia_narration",
    valueOn: "2026-09-05",
  },
  {
    amountPaise: 1_200_000,
    balancePaise: 12_634_250,
    direction: "debit" as const,
    id: "01930000-0000-7000-8000-000000000645",
    matchStatus: "unmatched" as const,
    narration: "NEFT DR-HALL RENT SEPTEMBER",
    reference: "RENTSEED09",
    valueOn: "2026-09-10",
  },
];

async function seedStatementLines(adminId: string): Promise<void> {
  await db
    .insert(statementLine)
    .values(
      STATEMENT_LINES.map((line, index) => ({
        ...line,
        createdAt: now,
        lineHash: `seed:${line.id}`,
        matchedAt: line.matchStatus === "unmatched" ? null : now,
        matchedBy: line.matchStatus === "unmatched" ? null : adminId,
        orgAccountId: ORG_ACCOUNTS[0]?.id as string,
        position: index + 1,
        updatedAt: now,
      }))
    )
    .onConflictDoNothing();
}

const SEED_IMPORT = {
  batchId: "01930000-0000-7000-8000-000000000631",
  contributionId: "01930000-0000-7000-8000-000000000632",
  identityId: "01930000-0000-7000-8000-000000000633",
  rowId: "01930000-0000-7000-8000-000000000634",
};

/** One finished CSV import of one gift, so the Imports tab and batch page have something to show. */
async function seedImportBatch(adminId: string): Promise<void> {
  const raw = {
    Amount: "1,000.00",
    Date: "01/09/2026",
    "Donation ID": "SEED-IMPORT-1",
    "Donor Name": PARTIES[0]?.displayName ?? "Seed donor",
  };
  await db
    .insert(importBatch)
    .values({
      completedAt: now,
      createdAt: now,
      dateFormat: "dmy",
      defaultChannel: "upi",
      fileHash: "seed",
      fileName: "seed-donations.csv",
      fundId: GENERAL_FUND_ID,
      id: SEED_IMPORT.batchId,
      importedCount: 1,
      mapping: {
        Amount: "amount",
        Date: "receivedOn",
        "Donation ID": "externalId",
        "Donor Name": "donorName",
      },
      orgAccountId: ORG_ACCOUNTS[0]?.id as string,
      parserVersion: 1,
      rowCount: 1,
      source: "generic_csv",
      status: "completed",
      updatedAt: now,
      uploadedBy: adminId,
    })
    .onConflictDoNothing();
  await db
    .insert(contribution)
    .values({
      amountPaise: 100_000,
      channel: "upi",
      createdAt: now,
      createdBy: adminId,
      fundId: GENERAL_FUND_ID,
      id: SEED_IMPORT.contributionId,
      importBatchId: SEED_IMPORT.batchId,
      orgAccountId: ORG_ACCOUNTS[0]?.id as string,
      partyId: DONOR_ID,
      receivedOn: "2026-09-01",
      reportingMode: "electronic_or_account_payee",
      source: "import",
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(externalIdentity)
    .values({
      contributionId: SEED_IMPORT.contributionId,
      createdAt: now,
      entityType: "payment",
      externalId: "SEED-IMPORT-1",
      id: SEED_IMPORT.identityId,
      payloadHash: "seed",
      provider: "generic",
      providerAccount: ORG_ACCOUNTS[0]?.id as string,
    })
    .onConflictDoNothing();
  await db
    .insert(importRow)
    .values({
      ...importedRowRetention(now.toISOString().slice(0, 10)),
      batchId: SEED_IMPORT.batchId,
      contributionId: SEED_IMPORT.contributionId,
      createdAt: now,
      decidedAt: now,
      decidedBy: adminId,
      externalIdentityId: SEED_IMPORT.identityId,
      id: SEED_IMPORT.rowId,
      outcome: "imported",
      partyId: DONOR_ID,
      raw,
      rawHash: "seed",
      rowNumber: 1,
    })
    .onConflictDoNothing();
  await db
    .insert(collectionEvent)
    .values({
      channel: "generic_csv",
      createdBy: adminId,
      evidenceNote:
        "collected directly by the organisation; notice version not recorded",
      id: "01930000-0000-7000-8000-000000000635",
      importBatchId: SEED_IMPORT.batchId,
      occurredAt: now,
      partyId: DONOR_ID,
      processingBasis: "voluntary_provision_7a",
      purpose: "donation receipt and statutory filing",
    })
    .onConflictDoNothing();
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
      programmeId: PROGRAMME_IDS.education,
      waId: ID.waTeaching,
    },
    {
      id: ID.teamKitchen,
      members: [
        { id: ID.tm04, role: "lead" as const, uid: v3 },
        { id: ID.tm05, role: "member" as const, uid: v1 },
      ],
      name: "Kitchen",
      programmeId: PROGRAMME_IDS.communitySupport,
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
      programmeId: PROGRAMME_IDS.communitySupport,
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
      programmeId: PROGRAMME_IDS.communitySupport,
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
          programmeId: t.programmeId,
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
          programmeId: TEAM_PROGRAMME[e.teamId] ?? PROGRAMME_IDS.unallocated,
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
      programmeId: PROGRAMME_IDS.artsAndCulture,
      startTime: eventDate,
      teamId: ID.teamEvents,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: {
        managementDomain: "kalakriti",
        programmeId: PROGRAMME_IDS.artsAndCulture,
      },
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
      nextStudentSequence: 2,
      nextVolunteerSequence: 1,
      plannedRegistrationCloseAt: new Date("2027-10-31T23:59:00+05:30"),
      teamEventId: ID.evKalakriti,
      updatedAt: now,
      year: 2027,
    })
    .onConflictDoUpdate({
      set: {
        nextStudentSequence: sql`greatest(${kalakritiEdition.nextStudentSequence}, 2)`,
      },
      target: kalakritiEdition.id,
    });

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
      location: "Jayanagar, Bengaluru",
      googleMapsUrl: "https://maps.google.com/?q=Jayanagar+Bengaluru",
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
      femaleStudentLimit: 20,
      id: ID.kalakritiAgeCategory,
      maleStudentLimit: 20,
      maxCompetitionsPerCategory: 2,
      maximumAge: 10,
      maxTotalCompetitions: 2,
      minimumAge: 6,
      name: "Junior",
      normalizedName: "junior",
      sortOrder: 0,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: {
        femaleStudentLimit: 20,
        maleStudentLimit: 20,
        maxCompetitionsPerCategory: 2,
        maximumAge: 10,
        maxTotalCompetitions: 2,
        minimumAge: 6,
        name: "Junior",
        normalizedName: "junior",
        sortOrder: 0,
        updatedAt: now,
      },
      target: kalakritiAgeCategory.id,
    });

  await db
    .insert(kalakritiStudent)
    .values({
      ageCategoryId: ID.kalakritiAgeCategory,
      centerId: ID.kalakritiCenter,
      createdAt: now,
      createdBy: adminId,
      dateOfBirth: "2019-04-12",
      derivedAgeCategoryId: ID.kalakritiAgeCategory,
      editionId: ID.kalakritiEdition,
      gender: "female",
      humanId: "KAL-2027-0001",
      id: ID.kalakritiStudent,
      name: "Aarohi Rao",
      normalizedName: "aarohi rao",
      updatedAt: now,
      updatedBy: adminId,
    })
    .onConflictDoNothing();

  await db
    .insert(kalakritiCompetitionCategory)
    .values({
      createdAt: now,
      createdBy: adminId,
      editionId: ID.kalakritiEdition,
      id: ID.kalakritiCompetitionCategory,
      name: "Performing Arts",
      normalizedName: "performing arts",
      sortOrder: 0,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(kalakritiCompetition)
    .values({
      competitionCategoryId: ID.kalakritiCompetitionCategory,
      createdAt: now,
      createdBy: adminId,
      editionId: ID.kalakritiEdition,
      genderEligibility: "both",
      id: ID.kalakritiCompetition,
      maximumGroupSize: 1,
      minimumGroupSize: 1,
      name: "Solo Dance",
      normalizedName: "solo dance",
      participationMode: "individual",
      sequentialPerformances: true,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(kalakritiVenue)
    .values({
      createdAt: now,
      createdBy: adminId,
      editionId: ID.kalakritiEdition,
      id: ID.kalakritiVenue,
      name: "Main Stage",
      normalizedName: "main stage",
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(kalakritiCompetitionDivision)
    .values({
      ageCategoryId: ID.kalakritiAgeCategory,
      competitionId: ID.kalakritiCompetition,
      createdAt: now,
      createdBy: adminId,
      editionId: ID.kalakritiEdition,
      id: ID.kalakritiCompetitionSession,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(kalakritiCompetitionSession)
    .values({
      createdAt: now,
      createdBy: adminId,
      divisionId: ID.kalakritiCompetitionSession,
      editionId: ID.kalakritiEdition,
      endAt: new Date("2027-11-21T10:00:00+05:30"),
      id: ID.kalakritiCompetitionSession,
      startAt: new Date("2027-11-21T09:00:00+05:30"),
      updatedAt: now,
      venueId: ID.kalakritiVenue,
    })
    .onConflictDoNothing();

  await db
    .insert(kalakritiCompetitionEntry)
    .values({
      centerId: ID.kalakritiCenter,
      createdAt: now,
      createdBy: adminId,
      divisionId: ID.kalakritiCompetitionSession,
      editionId: ID.kalakritiEdition,
      id: ID.kalakritiCompetitionEntry,
      participationMode: "individual",
      updatedAt: now,
      updatedBy: adminId,
    })
    .onConflictDoNothing();

  await db
    .insert(kalakritiEntryMember)
    .values({
      centerId: ID.kalakritiCenter,
      createdAt: now,
      createdBy: adminId,
      divisionId: ID.kalakritiCompetitionSession,
      editionId: ID.kalakritiEdition,
      entryId: ID.kalakritiCompetitionEntry,
      id: ID.kalakritiEntryMember,
      studentId: ID.kalakritiStudent,
    })
    .onConflictDoNothing();

  // Like the other seeded attachments, this metadata uses a demo object key.
  await db
    .insert(kalakritiEntryMusic)
    .values({
      id: "019d52c2-7261-7dce-b0ee-e206561715d1",
      editionId: ID.kalakritiEdition,
      entryId: ID.kalakritiCompetitionEntry,
      slot: 1,
      objectKey: `dev/kalakriti-music/${ID.kalakritiEdition}/${ID.kalakritiCompetitionEntry}/demo.mp3`,
      fileName: "demo.mp3",
      mimeType: "audio/mpeg",
      byteSize: 2048,
      uploadedAt: now,
      uploadedBy: adminId,
    })
    .onConflictDoNothing();

  // Seed an unpublished example only; final declarations require real event results.
  await db.transaction(async (tx) => {
    const [edition] = await tx
      .select({ lifecycle: kalakritiEdition.lifecycle })
      .from(kalakritiEdition)
      .where(eq(kalakritiEdition.id, ID.kalakritiEdition))
      .for("update");
    if (edition?.lifecycle !== "draft") return;
    const resultId = "01a0a932-06cb-7000-8000-000000000101";
    const scorecardId = "01a0a932-06cb-7000-8000-000000000102";
    const [created] = await tx
      .insert(kalakritiResult)
      .values({
        id: resultId,
        editionId: ID.kalakritiEdition,
        divisionId: ID.kalakritiCompetitionSession,
        version: 1,
        status: "draft",
        winnerEntryId: null,
        runnerUpEntryId: null,
        scorecardIds: [scorecardId],
        updatedAt: now,
        updatedBy: adminId,
      })
      .onConflictDoNothing()
      .returning({ id: kalakritiResult.id });
    if (!created) return;
    await tx
      .insert(kalakritiResultScorecard)
      .values({
        id: scorecardId,
        editionId: ID.kalakritiEdition,
        divisionId: ID.kalakritiCompetitionSession,
        objectKey: `dev/kalakriti-scorecards/${ID.kalakritiEdition}/${ID.kalakritiCompetitionSession}/demo.pdf`,
        fileName: "demo.pdf",
        mimeType: "application/pdf",
        byteSize: 2048,
        uploadedAt: now,
        uploadedBy: adminId,
      })
      .onConflictDoNothing();
    await tx
      .insert(kalakritiResultRevision)
      .values({
        id: "01a0a932-06cb-7000-8000-000000000103",
        editionId: ID.kalakritiEdition,
        resultId,
        version: 1,
        status: "draft",
        winnerEntryId: null,
        runnerUpEntryId: null,
        scorecardIds: [scorecardId],
        createdAt: now,
        createdBy: adminId,
      })
      .onConflictDoNothing();
    await tx
      .insert(kalakritiResultsState)
      .values({
        id: ID.kalakritiEdition,
        editionId: ID.kalakritiEdition,
        version: 1,
      })
      .onConflictDoNothing();
  });

  await db.transaction(async (tx) => {
    const [edition] = await tx
      .select({ lifecycle: kalakritiEdition.lifecycle })
      .from(kalakritiEdition)
      .where(eq(kalakritiEdition.id, ID.kalakritiEdition))
      .for("update");
    if (!edition || edition.lifecycle === "archived") return;
    const [item] = await tx
      .insert(kalakritiInventoryItem)
      .values({
        id: ID.kalakritiInventoryItem,
        editionId: ID.kalakritiEdition,
        name: "Drawing pencils",
        quantity: 100,
        unitPricePaise: 1000,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: kalakritiInventoryItem.id });
    if (!item) return;
    await tx.insert(kalakritiInventoryTransaction).values({
      id: ID.kalakritiInventoryTransaction,
      editionId: ID.kalakritiEdition,
      itemId: item.id,
      type: "initial_inventory",
      quantity: 100,
      quantityBefore: 0,
      quantityAfter: 100,
      actorUserId: adminId,
      createdAt: now,
    });
  });

  // Pending handover examples require a real published demo award; never seed a received prize.
  await db.transaction(async (tx) => {
    const [edition] = await tx
      .select({ lifecycle: kalakritiEdition.lifecycle })
      .from(kalakritiEdition)
      .where(eq(kalakritiEdition.id, ID.kalakritiEdition))
      .for("update");
    if (edition?.lifecycle !== "live") return;
    const [result] = await tx
      .select()
      .from(kalakritiResult)
      .where(
        and(
          eq(kalakritiResult.editionId, ID.kalakritiEdition),
          eq(kalakritiResult.divisionId, ID.kalakritiCompetitionSession),
          eq(kalakritiResult.status, "published")
        )
      );
    const award =
      result?.winnerEntryId === ID.kalakritiCompetitionEntry
        ? "winner"
        : result?.runnerUpEntryId === ID.kalakritiCompetitionEntry
          ? "runner_up"
          : null;
    if (!award) return;
    const [member] = await tx
      .select({ id: kalakritiEntryMember.id })
      .from(kalakritiEntryMember)
      .where(
        and(
          eq(kalakritiEntryMember.editionId, ID.kalakritiEdition),
          eq(kalakritiEntryMember.entryId, ID.kalakritiCompetitionEntry),
          eq(kalakritiEntryMember.studentId, ID.kalakritiStudent)
        )
      );
    if (!member) return;
    const [created] = await tx
      .insert(kalakritiAwardHandover)
      .values({
        id: "01a0a932-06cb-7000-8000-000000000104",
        editionId: ID.kalakritiEdition,
        divisionId: ID.kalakritiCompetitionSession,
        entryId: ID.kalakritiCompetitionEntry,
        studentId: ID.kalakritiStudent,
        award,
        awarded: false,
        version: 1,
        updatedAt: now,
        updatedBy: adminId,
      })
      .onConflictDoNothing()
      .returning({ id: kalakritiAwardHandover.id });
    if (!created) return;
    await tx
      .insert(kalakritiAwardCommand)
      .values({
        id: "01a0a932-06cb-7000-8000-000000000105",
        editionId: ID.kalakritiEdition,
        actorUserId: adminId,
        createdAt: now,
        payload: sql`${JSON.stringify({
          divisionId: ID.kalakritiCompetitionSession,
          entryId: ID.kalakritiCompetitionEntry,
          studentId: ID.kalakritiStudent,
          award,
          awarded: false,
          expectedVersions: [{ studentId: ID.kalakritiStudent, version: 0 }],
          now: now.getTime(),
        })}::text::jsonb`,
      })
      .onConflictDoNothing();
  });

  // Seed transport before event day, but operation history only after go-live.
  await db.transaction(async (tx) => {
    const [edition] = await tx
      .select({ lifecycle: kalakritiEdition.lifecycle })
      .from(kalakritiEdition)
      .where(eq(kalakritiEdition.id, ID.kalakritiEdition))
      .for("update");
    if (!edition || edition.lifecycle === "archived") {
      return;
    }
    for (const [kind, id, humanId, name] of [
      [
        "guest",
        "019d52c2-7261-7dce-b0ee-e20656171601",
        "KALGT-2027-0001",
        "Demo Guest",
      ],
      [
        "judge",
        "019d52c2-7261-7dce-b0ee-e20656171602",
        "KALJ-2027-0001",
        "Demo Judge",
      ],
    ] as const) {
      await tx
        .insert(kalakritiAttendee)
        .values({
          id,
          editionId: ID.kalakritiEdition,
          kind,
          humanId,
          name,
          phone: "+919000000099",
          email: null,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
          createdBy: adminId,
        })
        .onConflictDoNothing();
    }
    const [judge] = await tx
      .select()
      .from(kalakritiAttendee)
      .where(eq(kalakritiAttendee.id, "019d52c2-7261-7dce-b0ee-e20656171602"));
    if (
      judge &&
      judge.editionId === ID.kalakritiEdition &&
      judge.kind === "judge" &&
      judge.archivedAt === null
    ) {
      await tx
        .insert(kalakritiJudgeAssignment)
        .values({
          id: "019d52c2-7261-7dce-b0ee-e20656171603",
          editionId: ID.kalakritiEdition,
          attendeeId: judge.id,
          competitionId: ID.kalakritiCompetition,
          createdAt: now,
          createdBy: adminId,
        })
        .onConflictDoNothing();
    }
    const [center] = await tx
      .select({ retiredAt: kalakritiCenter.retiredAt })
      .from(kalakritiCenter)
      .where(eq(kalakritiCenter.id, ID.kalakritiCenter))
      .for("update");
    if (!center || center.retiredAt !== null) {
      return;
    }
    await tx
      .insert(kalakritiCenterScanStage)
      .values({
        id: ID.kalakritiCenterScanStage,
        editionId: ID.kalakritiEdition,
        centerId: ID.kalakritiCenter,
        stage: "pickup",
        createdBy: adminId,
        createdAt: now,
      })
      .onConflictDoNothing();
    const stages = await tx
      .select({
        stage: kalakritiCenterScanStage.stage,
        finalizedAt: kalakritiCenterScanStage.finalizedAt,
      })
      .from(kalakritiCenterScanStage)
      .where(eq(kalakritiCenterScanStage.centerId, ID.kalakritiCenter));
    const transportStatus = getKalakritiCenterTransportStatus(
      stages.map((stage) => ({
        ...stage,
        finalizedAt: stage.finalizedAt?.getTime() ?? null,
      }))
    );
    const [transport] = await tx
      .insert(kalakritiTransportAssignment)
      .values({
        id: ID.kalakritiTransportAssignment,
        editionId: ID.kalakritiEdition,
        centerId: ID.kalakritiCenter,
        vehicleLabel: "Demo bus 1",
        driverName: "Demo driver",
        pickupTime: eventDate,
        capacity: 30,
        status: transportStatus,
        createdBy: adminId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: kalakritiTransportAssignment.id });
    if (transport) {
      await tx.insert(kalakritiTransportStatusHistory).values({
        id: ID.kalakritiTransportHistory,
        assignmentId: transport.id,
        editionId: ID.kalakritiEdition,
        actorUserId: adminId,
        fromStatus: null,
        toStatus: transportStatus,
        createdAt: now,
        occurredAt: now,
      });
    }
    if (edition.lifecycle !== "live" || transportStatus !== "planned") {
      return;
    }
    const [history] = await tx
      .select({ id: kalakritiOperation.id })
      .from(kalakritiOperation)
      .where(eq(kalakritiOperation.studentId, ID.kalakritiStudent))
      .limit(1);
    if (history) {
      return;
    }
    await tx
      .insert(kalakritiOperation)
      .values({
        id: ID.kalakritiOperation,
        operationId: ID.kalakritiOperation,
        editionId: ID.kalakritiEdition,
        studentId: ID.kalakritiStudent,
        recordedBy: adminId,
        type: "pickup",
        occurredAt: eventDate,
        createdAt: now,
      })
      .onConflictDoNothing();
  });

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
      content: plateTextContent(
        "Great session! The kids were very engaged. Could use more art supplies next time."
      ),
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
      content: plateTextContent(
        "Meeting minutes: discussed Q2 goals, budget allocation, and volunteer recruitment targets."
      ),
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
      content: plateTextContent(
        "Reminder: please bring water bottles and sunscreen. We'll meet at the park entrance at 8 AM."
      ),
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
          amountPaise: 150000,
          cat: ID.catTravel,
          desc: "Bus pass - monthly",
          id: ID.rli01,
        },
        {
          amountPaise: 45000,
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
          amountPaise: 220000,
          cat: ID.catSupplies,
          desc: "Crayons and sketch pads",
          id: ID.rli03,
        },
        {
          amountPaise: 35000,
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
          amountPaise: 500000,
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
          amountPaise: 30000,
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
              amountPaise: item.amountPaise,
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
      amountPaise: 1000000,
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
      amountPaise: 300000,
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
  await ensureVendor({
    createdAt: past(60),
    createdBy: leadId,
    gstNumber: "29AABCQ1234F1ZA",
    id: ID2.vendor01,
    name: "QuickPrint Solutions",
    private: {
      address: "42 MG Road, Bangalore",
      bankAccountIfscCode: "HDFC0007890",
      bankAccountName: "QuickPrint Solutions",
      bankAccountNumber: "7771234567890",
      contactEmail: "info@quickprint.dev",
      contactPhone: "+919800011122",
    },
    status: "approved",
    updatedAt: past(55),
  });

  // Vendor 2 — Pending
  await ensureVendor({
    createdAt: past(5),
    createdBy: v1,
    id: ID2.vendor02,
    name: "Fresh Kitchen Caterers",
    private: {
      address: "15 Food Street, Bangalore",
      bankAccountIfscCode: "ICIC0008901",
      bankAccountName: "Fresh Kitchen Caterers",
      bankAccountNumber: "8881234567891",
      contactEmail: "orders@freshkitchen.dev",
      contactPhone: "+919800033344",
      panNumber: "AABCF1234G",
    },
    status: "pending",
    updatedAt: past(5),
  });

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
      amountPaise: 850000,
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
      amountPaise: 250000,
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
      amountPaise: 500000,
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
      amountPaise: 1500000,
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

  // Vendor 3 — Approved landlord
  await ensureVendor({
    createdAt: past(90),
    createdBy: adminId,
    id: ID2.vendor03,
    name: "Lakeview Properties",
    private: {
      address: "7 Lake Road, Bangalore",
      bankAccountIfscCode: "SBIN0004567",
      bankAccountName: "Lakeview Properties",
      bankAccountNumber: "6661234567892",
      contactPhone: "+919800055566",
    },
    status: "approved",
    updatedAt: past(90),
  });

  // Vendor Payment 3 — rent, completed without an invoice
  await db
    .insert(vendorPayment)
    .values({
      city: "bangalore",
      createdAt: past(30),
      id: ID2.vp03,
      invoiceDate: past(25).toISOString().slice(0, 10),
      invoiceReviewedAt: past(20),
      invoiceReviewedBy: adminId,
      noInvoiceNote: "Monthly office rent; the landlord issues a receipt only.",
      noInvoiceReason: "rent",
      reviewedAt: past(28),
      reviewedBy: adminId,
      status: "completed",
      submittedAt: past(29),
      title: "Office rent",
      updatedAt: past(20),
      userId: adminId,
      vendorId: ID2.vendor03,
    })
    .onConflictDoNothing();
  await db
    .insert(vendorPaymentLineItem)
    .values({
      amountPaise: 2_500_000,
      categoryId: ID.catVenue,
      createdAt: past(30),
      description: "Office rent for the month",
      id: ID2.vpLi04,
      sortOrder: 0,
      updatedAt: past(30),
      vendorPaymentId: ID2.vp03,
    })
    .onConflictDoNothing();
  await db
    .insert(vendorPaymentTransaction)
    .values({
      amountPaise: 2_500_000,
      createdAt: past(25),
      description: "Rent via NEFT",
      id: ID2.vpt02,
      paymentMethod: "NEFT",
      paymentReference: "NEFT-REF-002",
      reviewedAt: past(25),
      reviewedBy: adminId,
      status: "approved",
      transactionDate: past(25),
      updatedAt: past(25),
      userId: adminId,
      vendorPaymentId: ID2.vp03,
    })
    .onConflictDoNothing();
  // The rent receipt is the proof, kept with the invoice attachments.
  await db
    .insert(vendorPaymentAttachment)
    .values({
      createdAt: past(22),
      filename: "lakeview-rent-receipt.pdf",
      id: ID2.vpA03,
      mimeType: "application/pdf",
      objectKey: "dev/vendors/lakeview-rent-receipt.pdf",
      purpose: "invoice",
      type: "file",
      vendorPaymentId: ID2.vp03,
    })
    .onConflictDoNothing();
  await Promise.all(
    [
      {
        action: "created" as const,
        actor: adminId,
        at: past(30),
        id: ID2.vpH06,
      },
      {
        action: "approved" as const,
        actor: adminId,
        at: past(28),
        id: ID2.vpH07,
      },
      {
        action: "invoice_submitted" as const,
        actor: adminId,
        at: past(22),
        id: ID2.vpH08,
        metadata: { invoiceKind: "no_invoice", noInvoiceReason: "rent" },
        note: "No invoice: Rent / lease",
      },
      {
        action: "invoice_approved" as const,
        actor: adminId,
        at: past(20),
        id: ID2.vpH09,
      },
    ].map(async (h) => {
      await db
        .insert(vendorPaymentHistory)
        .values({
          action: h.action,
          actorId: h.actor,
          createdAt: h.at,
          id: h.id,
          metadata: "metadata" in h ? h.metadata : undefined,
          note: "note" in h ? h.note : undefined,
          vendorPaymentId: ID2.vp03,
        })
        .onConflictDoNothing();
    })
  );

  log("3 vendors, 3 payments, 2 transactions seeded");
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

// ── 12a. Email suppressions ──────────────────────────────────────────────────

/** One spam complaint, so the user sheet's "Email delivery" section has data. */
async function seedEmailSuppressions(): Promise<void> {
  log("Seeding email suppressions...");
  await db
    .insert(emailSuppression)
    .values({
      email: "volunteer3@pi-dash.dev",
      reason: "complaint",
      resendEmailId: "seed-complaint",
    })
    .onConflictDoNothing();
  log("1 email suppression seeded");
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

/**
 * Social API fixtures: the past teaching session is completed for social,
 * with partners and a recorded post; one dev-only API token whose raw value
 * is DEV_SOCIAL_API_TOKEN (never valid outside a seeded dev database).
 */
const DEV_SOCIAL_API_TOKEN = "dev-social-api-token";

async function seedSocial(): Promise<void> {
  log("Seeding social API data...");
  await db
    .update(teamEvent)
    .set({
      childrenAttended: 24,
      socialCompletedAt: addHours(past(7), 3),
      socialNotes: "Twenty-four children practised introductions in pairs.",
      volunteersNeeded: 4,
    })
    .where(
      and(eq(teamEvent.id, ID.evTeaching), isNull(teamEvent.socialCompletedAt))
    );
  await db
    .update(teamEvent)
    .set({ volunteersNeeded: 4 })
    .where(
      and(
        eq(teamEvent.id, ID.evTeachingNext),
        isNull(teamEvent.volunteersNeeded)
      )
    );
  await db
    .insert(eventPartner)
    .values([
      {
        createdAt: past(8),
        eventId: ID.evTeaching,
        id: ID.socialPartnerNss,
        instagram: "@nss_sfs",
        linkedin: null,
        name: "NSS SFS College",
      },
      {
        createdAt: past(8),
        eventId: ID.evTeaching,
        id: ID.socialPartnerEthos,
        instagram: null,
        linkedin: "ethos",
        name: "Ethos",
      },
    ])
    .onConflictDoNothing();
  await db
    .insert(socialPost)
    .values({
      bufferPostId: "dev-buffer-post-1",
      channel: "instagram",
      createdAt: past(6),
      eventId: ID.evTeaching,
      id: ID.socialPost01,
      kind: "recap",
      scheduledFor: past(5),
      status: "published",
      updatedAt: past(5),
    })
    .onConflictDoNothing();
  await db
    .insert(socialRun)
    .values({
      createdAt: past(5),
      digestSent: false,
      dropped: 0,
      errors: sql`'[]'::jsonb`,
      eventsSeen: 6,
      finishedAt: addHours(past(6), 0.05),
      id: ID.socialRun01,
      planned: 1,
      recorded: 1,
      rendered: 1,
      skipped: sql`${JSON.stringify(["volunteer-call: target already met"])}::text::jsonb`,
      startedAt: past(6),
      tick: "hourly",
    })
    .onConflictDoNothing();
  if (!shouldSeedDevSocialToken(process.env.NODE_ENV)) {
    log("social API data ready (dev token skipped in production)");
    return;
  }
  await db
    .insert(socialApiToken)
    .values({
      createdAt: now,
      id: ID.socialToken01,
      name: "Dev seed token",
      scopes: ["events:read", "photos:read", "signups:read", "social:write"],
      tokenHash: createHash("sha256")
        .update(DEV_SOCIAL_API_TOKEN)
        .digest("hex"),
    })
    .onConflictDoNothing();
  log("social API data ready");
}

async function seedAppConfig(): Promise<void> {
  log("Seeding app config...");
  const configs = [
    { key: "org_name", value: "Proud Indian NGO" },
    { key: "org_city", value: "Bangalore" },
    { key: "reimbursement_auto_approve_limit", value: "500" },
    // Historical totals that predate the dashboard (social API all-time stats).
    { key: "social_all_time_optimists", value: "3600" },
    { key: "social_all_time_hours", value: "14000" },
    { key: "social_all_time_reached", value: "23000" },
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
  await seedAuditLog(userMap);
  await seedCategories();
  await seedFinanceDimensions();
  await seedParties(getUser(userMap, "admin@pi-dash.dev"));
  await seedIncome(getUser(userMap, "admin@pi-dash.dev"));
  await seedBankAccounts(userMap);
  await seedWhatsappGroups();
  await seedTeams(userMap);
  await seedEvents(userMap);
  await seedKalakriti(userMap);
  await seedEventRsvp(userMap);
  await seedEventExtras(userMap);
  await seedSocial();
  await seedReimbursements(userMap);
  await seedAdvancePayments(userMap);
  await seedVendors(userMap);
  await seedScheduledMessages(userMap);
  await seedNotificationPreferences(userMap);
  await seedEmailSuppressions();
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
