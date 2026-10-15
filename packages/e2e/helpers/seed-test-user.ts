import path from "node:path";

import { auth } from "@pi-dash/auth";
import { db } from "@pi-dash/db";
import {
  encryptSecret,
  hasEncryptionKey,
  visibleTail,
} from "@pi-dash/db/encryption";
import { partyIdNumberContext } from "@pi-dash/db/queries/party-private";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { auditLog } from "@pi-dash/db/schema/audit-log";
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
import { orgAccount } from "@pi-dash/db/schema/finance-dimensions";
import { contribution } from "@pi-dash/db/schema/income";
import { party, partyRole } from "@pi-dash/db/schema/party";
import { role, rolePermission } from "@pi-dash/db/schema/permission";
import { partyPrivate } from "@pi-dash/db/schema/private/party-private";
import { vendorLegacyDetails } from "@pi-dash/db/schema/private/vendor-legacy";
import {
  reimbursement,
  reimbursementAttachment,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import {
  vendorPayment,
  vendorPaymentLineItem,
} from "@pi-dash/db/schema/vendor";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { ensureFinanceDimensions } from "@pi-dash/db/seed-finance-dimensions";
import { ensureVendor } from "@pi-dash/db/seed-vendors";
import { syncPermissions } from "@pi-dash/db/sync-permissions";
import { addDays, addHours, subDays } from "date-fns";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { seedKalakritiReleaseFixture } from "./kalakriti-release-fixture";

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
const AUDIT_ENTRY_ID = "00000000-0000-4000-8000-000000000001";
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

async function ensureAuditLogEntry(superAdminUserId: string): Promise<void> {
  const existing = await db.query.auditLog.findFirst({
    columns: { id: true },
    where: (table, ops) => ops.eq(table.id, AUDIT_ENTRY_ID),
  });
  if (existing) {
    return;
  }

  await db.insert(auditLog).values({
    action: "e2e.audit.seed",
    actorName: "Test Super Admin",
    actorRole: "super_admin",
    actorUserId: superAdminUserId,
    completedAt: new Date(),
    id: AUDIT_ENTRY_ID,
    metadata: { source: "e2e" },
    outcome: "success",
    targetId: superAdminUserId,
    targetType: "user",
    traceId: "00000000000000000000000000000001",
  });
}

const SEED_DONOR_ID = "01930000-0000-7000-8000-000000000701";

/** A donor with contact details but no identifier, so the seed needs no encryption key. */
async function ensureDonorParty(userId: string): Promise<void> {
  const now = new Date();
  await db
    .insert(party)
    .values({
      createdAt: now,
      createdBy: userId,
      displayName: "E2E Seed Donor",
      id: SEED_DONOR_ID,
      kind: "person",
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(partyRole)
    .values({
      active: true,
      id: "01930000-0000-7000-8000-000000000702",
      partyId: SEED_DONOR_ID,
      role: "donor",
      since: now,
    })
    .onConflictDoNothing();
  await db
    .insert(partyPrivate)
    .values({
      assessedOn: "2026-04-01",
      city: "Bengaluru",
      email: "seed-donor@pi-dash.test",
      partyId: SEED_DONOR_ID,
      updatedAt: now,
      updatedBy: userId,
    })
    .onConflictDoNothing();
}

/** Must match GENERAL_FUND_ID in @pi-dash/shared/constants (seeded by finance dimensions). */
const GENERAL_FUND_ID = "01930000-0000-7000-8000-000000000201";
const E2E_ORG_ACCOUNT_ID = "01930000-0000-7000-8000-000000000711";
/** The account the Razorpay spec picks as its clearing account. */
const E2E_RAZORPAY_CLEARING_ID = "01930000-0000-7000-8000-000000000713";
/** The account a give.do upload defaults to. */
const E2E_GIVE_DO_ACCOUNT_ID = "01930000-0000-7000-8000-000000000714";
const E2E_DEPOSIT_ACCOUNT_ID = "01930000-0000-7000-8000-000000000715";
const INCOME_DONOR_ID = "01930000-0000-7000-8000-000000000721";
const INCOME_SPONSOR_ID = "01930000-0000-7000-8000-000000000723";

/**
 * Income fixtures: a deposit account, one ₹12,345 gift from the seed donor
 * (whose Giving section the specs read, so no spec records against it), and
 * a second donor the specs record new contributions for, and a sponsor.
 */
async function ensureIncomeFixtures(userId: string): Promise<void> {
  const now = new Date();
  // Today in India, where the financial year is counted, so the seed gift is
  // always in the current year that the Missing donor details stat covers.
  const todayInIndia = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(now);
  await db
    .insert(orgAccount)
    .values({
      createdAt: now,
      id: E2E_ORG_ACCOUNT_ID,
      kind: "bank",
      name: "E2E Bank Account",
      updatedAt: now,
    })
    .onConflictDoNothing();
  // The account a give.do upload defaults to.
  await db
    .insert(orgAccount)
    .values({
      createdAt: now,
      id: E2E_GIVE_DO_ACCOUNT_ID,
      kind: "gateway_clearing",
      name: "E2E give.do clearing",
      updatedAt: now,
    })
    .onConflictDoNothing();
  // The books' fixed deposit (opening balances E2E).
  await db
    .insert(orgAccount)
    .values({
      createdAt: now,
      id: E2E_DEPOSIT_ACCOUNT_ID,
      kind: "deposit",
      name: "E2E Fixed deposit",
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(orgAccount)
    .values({
      createdAt: now,
      id: E2E_RAZORPAY_CLEARING_ID,
      kind: "gateway_clearing",
      name: "E2E Razorpay Clearing",
      updatedAt: now,
    })
    .onConflictDoNothing();
  // Razorpay gifts land in it (the contribution form fixes the account); the
  // Razorpay spec chooses it again and puts the setting back afterwards.
  await db
    .insert(appConfig)
    .values({
      key: "razorpay_clearing_account_id",
      updatedAt: now,
      value: E2E_RAZORPAY_CLEARING_ID,
    })
    .onConflictDoNothing();
  await db
    .insert(contribution)
    .values({
      amountPaise: 1_234_500,
      channel: "neft",
      createdAt: now,
      createdBy: userId,
      fundId: GENERAL_FUND_ID,
      id: "01930000-0000-7000-8000-000000000712",
      orgAccountId: E2E_ORG_ACCOUNT_ID,
      partyId: SEED_DONOR_ID,
      receivedOn: todayInIndia,
      reference: "E2E-SEED-UTR",
      reportingMode: "electronic_or_account_payee",
      status: "received",
      updatedAt: now,
    })
    // A reused database keeps the gift received and in the current year.
    .onConflictDoUpdate({
      set: { receivedOn: todayInIndia, status: "received", updatedAt: now },
      target: contribution.id,
    });
  await db
    .insert(party)
    .values({
      createdAt: now,
      createdBy: userId,
      displayName: "E2E Income Donor",
      id: INCOME_DONOR_ID,
      kind: "person",
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(partyRole)
    .values({
      active: true,
      id: "01930000-0000-7000-8000-000000000722",
      partyId: INCOME_DONOR_ID,
      role: "donor",
      since: now,
    })
    .onConflictDoNothing();
  // CSR money comes from sponsors, so a sponsor can be the giver too.
  await db
    .insert(party)
    .values({
      createdAt: now,
      createdBy: userId,
      displayName: "E2E Income Sponsor",
      id: INCOME_SPONSOR_ID,
      kind: "organisation",
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(partyRole)
    .values({
      active: true,
      id: "01930000-0000-7000-8000-000000000724",
      partyId: INCOME_SPONSOR_ID,
      role: "sponsor",
      since: now,
    })
    .onConflictDoNothing();
}

const RETURN_DONOR_ID = "01930000-0000-7000-8000-000000000731";
const READY_DONOR_ID = "01930000-0000-7000-8000-000000000733";
/** Must match the PAN the donations return spec expects in the upload file. */
const READY_DONOR_PAN = "AAAPE1234E";

/**
 * Donations return fixtures, each with one gift today (so always in the
 * current financial year): a donor with neither ID nor address, whose
 * tax-certificate switch the spec flips (reset here on every run), and a
 * donor with a PAN and an address whose gift is ready for the upload file
 * (only when DATA_ENCRYPTION_KEY is set, as in CI and local runs). The 80G
 * registration is cleared so the spec enters it through Settings.
 */
async function ensureReturnFixtures(userId: string): Promise<void> {
  const now = new Date();
  const todayInIndia = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(now);
  const donors = [
    {
      contributionId: "01930000-0000-7000-8000-000000000735",
      id: RETURN_DONOR_ID,
      name: "E2E Return Donor",
      roleId: "01930000-0000-7000-8000-000000000732",
    },
    {
      contributionId: "01930000-0000-7000-8000-000000000736",
      id: READY_DONOR_ID,
      name: "E2E Ready Donor",
      roleId: "01930000-0000-7000-8000-000000000734",
    },
  ];
  for (const donor of donors) {
    await db
      .insert(party)
      .values({
        createdAt: now,
        createdBy: userId,
        displayName: donor.name,
        id: donor.id,
        kind: "person",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        set: { taxCertificateOptOut: false, updatedAt: now },
        target: party.id,
      });
    await db
      .insert(partyRole)
      .values({
        active: true,
        id: donor.roleId,
        partyId: donor.id,
        role: "donor",
        since: now,
      })
      .onConflictDoNothing();
    await db
      .insert(contribution)
      .values({
        amountPaise: 250_000,
        channel: "upi",
        createdAt: now,
        createdBy: userId,
        fundId: GENERAL_FUND_ID,
        id: donor.contributionId,
        orgAccountId: E2E_ORG_ACCOUNT_ID,
        partyId: donor.id,
        receivedOn: todayInIndia,
        reference: `E2E-RETURN-${donor.contributionId.slice(-3)}`,
        reportingMode: "electronic_or_account_payee",
        status: "received",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        set: {
          deductionEligible: "unknown",
          eligibilityReason: null,
          receivedOn: todayInIndia,
          status: "received",
          updatedAt: now,
        },
        target: contribution.id,
      });
  }
  // No ID and no address.
  await db
    .insert(partyPrivate)
    .values({
      email: "return-donor@pi-dash.test",
      partyId: RETURN_DONOR_ID,
      updatedAt: now,
      updatedBy: userId,
    })
    .onConflictDoNothing();
  if (hasEncryptionKey()) {
    const values = {
      addressLine1: "12, MG Road",
      city: "Bengaluru",
      idNumberEncrypted: encryptSecret(
        READY_DONOR_PAN,
        partyIdNumberContext(READY_DONOR_ID)
      ),
      idNumberLast4: visibleTail(READY_DONOR_PAN),
      idType: "pan" as const,
      pincode: "560001",
      state: "Karnataka",
      updatedAt: now,
      updatedBy: userId,
    };
    await db
      .insert(partyPrivate)
      .values({ ...values, partyId: READY_DONOR_ID })
      .onConflictDoUpdate({ set: values, target: partyPrivate.partyId });
  }
  await db
    .delete(appConfig)
    .where(eq(appConfig.key, "donations_return_registration"));
}

const RECEIPT_DONOR_ID = "01930000-0000-7000-8000-000000000741";
const RECEIPT_DONOR_PAN = "ABCPR1234R";
/** A receipt donor without an address, until the receipts spec adds one. */
const RECEIPT_DETAILS_DONOR_ID = "01930000-0000-7000-8000-000000000746";
const RECEIPT_DETAILS_DONOR_PAN = "ABCPD1234D";

/**
 * Donation receipt fixtures: fake receipt details in Settings, and a donor
 * with a PAN and an address who gave once by UPI (receiptable here) and
 * once through give.do (receipted by give.do, so never here). Both gifts
 * are dated today. The 80G registration is left to the spec, which enters
 * it through Settings as the donations return spec does. Fake details only.
 */
async function ensureReceiptFixtures(userId: string): Promise<void> {
  const now = new Date();
  const todayInIndia = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(now);
  const settings = JSON.stringify({
    orgAddress: "1 Test Road, Testville 560001",
    orgName: "E2E Test Trust",
    orgPan: "AAATE0000E",
    signatoryDesignation: "Test Treasurer",
    signatoryName: "E2E Signatory",
  });
  await db
    .insert(appConfig)
    .values({
      key: "donation_receipt_settings",
      updatedAt: now,
      value: settings,
    })
    .onConflictDoUpdate({
      set: { updatedAt: now, value: settings },
      target: appConfig.key,
    });
  if (!hasEncryptionKey()) {
    return;
  }
  await db
    .insert(party)
    .values({
      createdAt: now,
      createdBy: userId,
      displayName: "E2E Receipt Donor",
      id: RECEIPT_DONOR_ID,
      kind: "person",
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(partyRole)
    .values({
      active: true,
      id: "01930000-0000-7000-8000-000000000742",
      partyId: RECEIPT_DONOR_ID,
      role: "donor",
      since: now,
    })
    .onConflictDoNothing();
  const details = {
    addressLine1: "7, Test Street",
    city: "Bengaluru",
    email: "receipt-donor@pi-dash.test",
    idNumberEncrypted: encryptSecret(
      RECEIPT_DONOR_PAN,
      partyIdNumberContext(RECEIPT_DONOR_ID)
    ),
    idNumberLast4: visibleTail(RECEIPT_DONOR_PAN),
    idType: "pan" as const,
    pincode: "560001",
    state: "Karnataka",
    updatedAt: now,
    updatedBy: userId,
  };
  await db
    .insert(partyPrivate)
    .values({ ...details, partyId: RECEIPT_DONOR_ID })
    .onConflictDoUpdate({ set: details, target: partyPrivate.partyId });
  const gifts = [
    {
      amountPaise: 300_000,
      channel: "upi" as const,
      id: "01930000-0000-7000-8000-000000000743",
      orgAccountId: E2E_ORG_ACCOUNT_ID,
      reference: "E2E-RECEIPT-UPI",
    },
    {
      amountPaise: 110_000,
      channel: "give_do" as const,
      id: "01930000-0000-7000-8000-000000000744",
      orgAccountId: E2E_GIVE_DO_ACCOUNT_ID,
      reference: "E2E-RECEIPT-GIVEDO",
    },
    {
      amountPaise: 120_000,
      channel: "razorpay" as const,
      id: "01930000-0000-7000-8000-000000000745",
      orgAccountId: E2E_RAZORPAY_CLEARING_ID,
      reference: "E2E-RECEIPT-RAZORPAY",
    },
  ];
  for (const gift of gifts) {
    await db
      .insert(contribution)
      .values({
        ...gift,
        createdAt: now,
        createdBy: userId,
        fundId: GENERAL_FUND_ID,
        partyId: RECEIPT_DONOR_ID,
        receivedOn: todayInIndia,
        reportingMode: "electronic_or_account_payee",
        status: "received",
        updatedAt: now,
      })
      .onConflictDoNothing();
  }

  await db
    .insert(party)
    .values({
      createdAt: now,
      createdBy: userId,
      displayName: "E2E Receipt Details Donor",
      id: RECEIPT_DETAILS_DONOR_ID,
      kind: "person",
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(partyRole)
    .values({
      active: true,
      id: "01930000-0000-7000-8000-000000000747",
      partyId: RECEIPT_DETAILS_DONOR_ID,
      role: "donor",
      since: now,
    })
    .onConflictDoNothing();
  const missingAddress = {
    addressLine1: null,
    idNumberEncrypted: encryptSecret(
      RECEIPT_DETAILS_DONOR_PAN,
      partyIdNumberContext(RECEIPT_DETAILS_DONOR_ID)
    ),
    idNumberLast4: visibleTail(RECEIPT_DETAILS_DONOR_PAN),
    idType: "pan" as const,
    pincode: null,
    updatedAt: now,
    updatedBy: userId,
  };
  await db
    .insert(partyPrivate)
    .values({ ...missingAddress, partyId: RECEIPT_DETAILS_DONOR_ID })
    .onConflictDoUpdate({ set: missingAddress, target: partyPrivate.partyId });
  await db
    .insert(contribution)
    .values({
      amountPaise: 130_000,
      channel: "upi",
      createdAt: now,
      createdBy: userId,
      fundId: GENERAL_FUND_ID,
      id: "01930000-0000-7000-8000-000000000748",
      orgAccountId: E2E_ORG_ACCOUNT_ID,
      partyId: RECEIPT_DETAILS_DONOR_ID,
      receivedOn: todayInIndia,
      reference: "E2E-RECEIPT-DETAILS",
      reportingMode: "electronic_or_account_payee",
      status: "received",
      updatedAt: now,
    })
    .onConflictDoNothing();
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
const SEED_EXPORT_VENDOR_PAYMENT_ID = "e2e00000-0000-0000-0000-000000000007";
const SEED_LEGACY_VENDOR_ID = "e2e00000-0000-0000-0000-000000000008";
const ZERO_AUTH_PROTECTED_TEAM_ID = "e2e00000-0000-0000-0000-000000000101";
const ZERO_AUTH_LEAD_TEAM_ID = "e2e00000-0000-0000-0000-000000000102";
const ZERO_AUTH_PROTECTED_EVENT_ID = "e2e00000-0000-4000-8000-000000000201";
const ZERO_AUTH_LEAD_EVENT_ID = "e2e00000-0000-0000-0000-000000000202";
const ZERO_AUTH_PROTECTED_MEDIA_KEY = `${process.env.R2_KEY_PREFIX ?? "attachments"}/updates/${ZERO_AUTH_PROTECTED_EVENT_ID}/e2e-editor-image.jpg`;
const ZERO_AUTH_PROTECTED_UPDATE_CONTENT = JSON.stringify([
  {
    children: [
      { text: "Protected pending update fixture" },
      {
        children: [{ text: "" }],
        type: "img",
        url: ZERO_AUTH_PROTECTED_MEDIA_KEY,
      },
    ],
    type: "p",
  },
]);
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

const plateTextContent = (text: string): string =>
  JSON.stringify([{ children: [{ text }], type: "p" }]);

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
    chargedTo: "event",
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
      amountPaise: 25000,
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
      amountPaise: 15000,
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
    chargedTo: "event",
    city: "bangalore",
    createdAt: now,
    eventId,
    expenseDate: "2026-01-15",
    id: SEED_UPCOMING_REIMBURSEMENT_ID,
    status: "approved",
    title: "E2E Upcoming Event Reimbursement",
    updatedAt: now,
    userId,
  });

  await db.insert(reimbursementLineItem).values({
    amountPaise: 27500,
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

/**
 * A vendor whose details still sit in the pre-party legacy table, as they do
 * in production until the backfill runs. Editing it migrates the row, so once
 * party details exist a later run leaves it alone.
 * It only exercises the legacy fallback on a fresh database, which run-e2e.sh
 * guarantees by starting with `down -v`.
 */
async function ensureLegacyVendor(userId: string): Promise<void> {
  await ensureVendor({
    createdBy: userId,
    id: SEED_LEGACY_VENDOR_ID,
    name: "E2E Legacy Vendor",
    status: "approved",
  });
  const [migrated] = await db
    .select({ partyId: partyPrivate.partyId })
    .from(partyPrivate)
    .where(eq(partyPrivate.partyId, SEED_LEGACY_VENDOR_ID))
    .limit(1);
  if (migrated) {
    return;
  }
  await db
    .insert(vendorLegacyDetails)
    .values({
      bankAccountIfscCode: "SBIN0001234",
      bankAccountName: "E2E Legacy Account",
      bankAccountNumber: "1234509876",
      contactPhone: "+919888877777",
      movedAt: new Date(),
      panNumber: "AABCL1234K",
      vendorId: SEED_LEGACY_VENDOR_ID,
    })
    .onConflictDoNothing();
}

async function ensureEventVendorPayment(
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

async function ensureExportVendorPayment(userId: string): Promise<void> {
  const existingPayment = await db.query.vendorPayment.findFirst({
    where: (table, ops) => ops.eq(table.id, SEED_EXPORT_VENDOR_PAYMENT_ID),
  });
  if (existingPayment) {
    return;
  }

  const category = await db.query.expenseCategory.findFirst();
  const seededVendor = await db.query.vendor.findFirst({
    where: (table, ops) => ops.eq(table.id, SEED_VENDOR_ID),
  });
  if (!(category && seededVendor)) {
    throw new Error(
      "Vendor payment export fixture requires category and vendor"
    );
  }

  const createdAt = new Date("2026-07-01T00:00:00.000Z");
  await db.insert(vendorPayment).values({
    chargedTo: "organisation",
    city: "bangalore",
    createdAt,
    id: SEED_EXPORT_VENDOR_PAYMENT_ID,
    invoiceDate: "2026-01-20",
    invoiceNumber: "E2E-INV-2026-001",
    status: "completed",
    submittedAt: createdAt,
    title: "E2E Export Vendor Payment",
    updatedAt: createdAt,
    userId,
    vendorId: seededVendor.id,
  });

  await db.insert(vendorPaymentLineItem).values({
    amountPaise: 87500,
    categoryId: category.id,
    createdAt,
    description: "Export date filter fixture",
    id: uuidv7(),
    sortOrder: 0,
    updatedAt: createdAt,
    vendorPaymentId: SEED_EXPORT_VENDOR_PAYMENT_ID,
  });

  log("Created vendor payment export fixture");
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
    .update(teamEvent)
    .set({ isPublic: false })
    .where(eq(teamEvent.id, ZERO_AUTH_PROTECTED_EVENT_ID));

  await db
    .update(user)
    .set({
      image: `${process.env.R2_KEY_PREFIX ?? "attachments"}/avatars/${volunteerUserId}/e2e-avatar.jpg`,
    })
    .where(eq(user.id, volunteerUserId));

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
    .onConflictDoUpdate({
      set: { content: ZERO_AUTH_PROTECTED_UPDATE_CONTENT },
      target: eventUpdate.id,
    });

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
        content: plateTextContent("Protected lead feedback fixture"),
        createdAt: now,
        eventId: ZERO_AUTH_LEAD_EVENT_ID,
        id: ZERO_AUTH_LEAD_FEEDBACK_ID,
        updatedAt: now,
      },
      {
        content: plateTextContent("Protected participant feedback fixture"),
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
const SEED_PENDING_UPDATE_CONTENT = plateTextContent(
  "This is a pending update from a volunteer that needs admin approval."
);

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

const SEED_INTEREST_EVENT_NAME = "E2E Upcoming Event With Pending Interests";
const SEED_PHOTO_EVENT_NAME = "E2E Past Event With Pending Photos";
const SEED_PENDING_PHOTO_COUNT = 3;
const SEED_OPEN_INTEREST_TEAM_NAME = "E2E Interest Team";
const SEED_OPEN_INTEREST_EVENT_NAME = "E2E Open Interest Event";
const SEED_FEEDBACK_EVENT_NAME = "E2E Seeded Feedback Event";
const SEED_RSVP_TEAM_NAME = "E2E RSVP Team";
const SEED_SANDBOX_TEAM_NAME = "E2E Sandbox Team";
const SEED_SANDBOX_SOURCE_EVENT_NAME = "E2E Sandbox Source Event";
const SEED_RSVP_WHATSAPP_JID = "e2e-rsvp-group@g.us";

/**
 * Events owned by the approval specs: two pending interest requests (one to
 * approve, one to reject) and three pending photos (one approved alone, the
 * rest with Approve all). Separate from the Zero authorization fixtures, which
 * must stay pending.
 */
async function ensureApprovalFixtures({
  adminUserId,
  financeAdminUserId,
  teamId,
  unorientedUserId,
  volunteerUserId,
}: {
  adminUserId: string;
  financeAdminUserId: string;
  teamId: string;
  unorientedUserId: string;
  volunteerUserId: string;
}): Promise<void> {
  const existing = await db.query.teamEvent.findFirst({
    where: (table, ops) => ops.eq(table.name, SEED_INTEREST_EVENT_NAME),
  });
  if (existing) {
    log("Approval fixtures already exist — skipping");
    return;
  }
  const now = new Date();

  const interestEventId = uuidv7();
  await db.insert(teamEvent).values({
    createdAt: subDays(now, 1),
    createdBy: adminUserId,
    description: "Upcoming event with pending interest requests for E2E tests",
    id: interestEventId,
    isPublic: true,
    name: SEED_INTEREST_EVENT_NAME,
    startTime: addDays(now, 10),
    teamId,
    updatedAt: subDays(now, 1),
  });
  // The unoriented volunteer's request is only ever looked at, never decided.
  await db.insert(eventInterest).values(
    [volunteerUserId, financeAdminUserId, unorientedUserId].map((userId) => ({
      createdAt: subDays(now, 1),
      eventId: interestEventId,
      id: uuidv7(),
      message: "E2E interest request",
      status: "pending" as const,
      userId,
    }))
  );

  const photoEventId = uuidv7();
  await db.insert(teamEvent).values({
    createdAt: subDays(now, 4),
    createdBy: adminUserId,
    description: "Past event with pending photos for E2E tests",
    id: photoEventId,
    isPublic: true,
    name: SEED_PHOTO_EVENT_NAME,
    startTime: subDays(now, 2),
    teamId,
    updatedAt: subDays(now, 4),
  });
  await db.insert(teamEventMember).values({
    addedAt: subDays(now, 4),
    eventId: photoEventId,
    id: uuidv7(),
    userId: volunteerUserId,
  });
  await db.insert(eventPhoto).values(
    Array.from({ length: SEED_PENDING_PHOTO_COUNT }, (_, index) => ({
      caption: `E2E pending photo ${index + 1}`,
      createdAt: subDays(now, 1),
      eventId: photoEventId,
      id: uuidv7(),
      mimeType: "image/jpeg",
      r2Key: `e2e/pending-photo-${index + 1}.jpg`,
      status: "pending" as const,
      uploadedBy: volunteerUserId,
    }))
  );

  // A public event in a team the volunteer is not in, so they can show
  // interest in it from the event page.
  const openTeamId = uuidv7();
  await db.insert(team).values({
    createdAt: subDays(now, 1),
    description: "Team the volunteer is not in, for E2E interest tests",
    id: openTeamId,
    name: SEED_OPEN_INTEREST_TEAM_NAME,
    updatedAt: subDays(now, 1),
  });
  await db.insert(teamMember).values({
    id: uuidv7(),
    joinedAt: subDays(now, 1),
    role: "lead",
    teamId: openTeamId,
    userId: adminUserId,
  });
  await db.insert(teamEvent).values({
    createdAt: subDays(now, 1),
    createdBy: adminUserId,
    description: "Public event open for volunteer interest in E2E tests",
    id: uuidv7(),
    isPublic: true,
    name: SEED_OPEN_INTEREST_EVENT_NAME,
    startTime: addDays(now, 12),
    teamId: openTeamId,
    updatedAt: subDays(now, 1),
  });

  // A team with its own WhatsApp group, so its events can post RSVP polls
  // without taking a group from the shared pool.
  const rsvpGroupId = uuidv7();
  await db.insert(whatsappGroup).values({
    createdAt: now,
    id: rsvpGroupId,
    jid: SEED_RSVP_WHATSAPP_JID,
    name: "E2E RSVP Group",
    updatedAt: now,
  });
  const rsvpTeamId = uuidv7();
  await db.insert(team).values({
    createdAt: subDays(now, 1),
    description: "Team with a WhatsApp group for E2E RSVP poll tests",
    id: rsvpTeamId,
    name: SEED_RSVP_TEAM_NAME,
    updatedAt: subDays(now, 1),
    whatsappGroupId: rsvpGroupId,
  });
  await db.insert(teamMember).values({
    id: uuidv7(),
    joinedAt: subDays(now, 1),
    role: "lead",
    teamId: rsvpTeamId,
    userId: adminUserId,
  });

  // A team for specs that create, edit, cancel or duplicate events, so the
  // seeded team's list stays stable for the filter and read-only specs.
  const sandboxTeamId = uuidv7();
  await db.insert(team).values({
    createdAt: subDays(now, 1),
    description: "Team for E2E specs that change events",
    id: sandboxTeamId,
    name: SEED_SANDBOX_TEAM_NAME,
    updatedAt: subDays(now, 1),
  });
  await db.insert(teamMember).values({
    id: uuidv7(),
    joinedAt: subDays(now, 1),
    role: "lead",
    teamId: sandboxTeamId,
    userId: adminUserId,
  });
  await db.insert(teamEvent).values({
    createdAt: subDays(now, 1),
    createdBy: adminUserId,
    description: "Event the duplication specs copy",
    id: uuidv7(),
    isPublic: true,
    location: "Sandbox Hall, Bangalore",
    name: SEED_SANDBOX_SOURCE_EVENT_NAME,
    startTime: addDays(now, 6),
    teamId: sandboxTeamId,
    updatedAt: subDays(now, 1),
  });

  // A past event with anonymous feedback on, for the volunteer feedback flow.
  const feedbackEventId = uuidv7();
  await db.insert(teamEvent).values({
    createdAt: subDays(now, 5),
    createdBy: adminUserId,
    description: "Past event with feedback enabled for E2E tests",
    feedbackEnabled: true,
    id: feedbackEventId,
    isPublic: true,
    name: SEED_FEEDBACK_EVENT_NAME,
    startTime: subDays(now, 1),
    teamId,
    updatedAt: subDays(now, 5),
  });
  await db.insert(teamEventMember).values({
    addedAt: subDays(now, 5),
    eventId: feedbackEventId,
    id: uuidv7(),
    userId: volunteerUserId,
  });

  log(
    "Created event fixtures: pending interests, photos, open and feedback events"
  );
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
  await ensureFinanceDimensions();
  await verifyReservedPermissionSync();
  log("Synced roles and permissions");

  await ensureExpenseCategories();
  await ensureWhatsAppGroup();

  let superAdminUserId = "";
  let financeAdminUserId = "";
  let unorientedUserId = "";
  let volunteerUserId = "";
  await Promise.all(
    TEST_USERS.map(async (testUser) => {
      const userId = await ensureTestUser(testUser);
      await ensureBankAccount(userId);
      if (testUser.role === "super_admin") {
        superAdminUserId = userId;
      } else if (testUser.role === "finance_admin") {
        financeAdminUserId = userId;
      } else if (testUser.role === "unoriented_volunteer") {
        unorientedUserId = userId;
      } else if (testUser.role === "volunteer") {
        volunteerUserId = userId;
      }
    })
  );

  const teamId = await ensureEventWithPendingUpdate(
    superAdminUserId,
    volunteerUserId
  );
  await seedKalakritiReleaseFixture(superAdminUserId, teamId);
  await ensureZeroQueryAuthorizationFixtures(superAdminUserId, volunteerUserId);
  await ensureFilterTestEvents(teamId, superAdminUserId, volunteerUserId);
  await ensureApprovalFixtures({
    adminUserId: superAdminUserId,
    financeAdminUserId,
    teamId,
    unorientedUserId,
    volunteerUserId,
  });
  await ensureAuditLogEntry(superAdminUserId);
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
  await ensureLegacyVendor(superAdminUserId);
  await ensureDonorParty(superAdminUserId);
  await ensureIncomeFixtures(superAdminUserId);
  await ensureReturnFixtures(superAdminUserId);
  await ensureReceiptFixtures(superAdminUserId);
  await ensureExportVendorPayment(superAdminUserId);
  await ensureUpcomingEventReimbursement(superAdminUserId, upcomingEvent.id);
}

seed().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown error seeding test users";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
