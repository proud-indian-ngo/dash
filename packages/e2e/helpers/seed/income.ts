import path from "node:path";

import { db } from "@pi-dash/db";
import {
  encryptSecret,
  hasEncryptionKey,
  visibleTail,
} from "@pi-dash/db/encryption";
import { partyIdNumberContext } from "@pi-dash/db/queries/party-private";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { orgAccount } from "@pi-dash/db/schema/finance-dimensions";
import { contribution } from "@pi-dash/db/schema/income";
import { party, partyRole } from "@pi-dash/db/schema/party";
import { partyPrivate } from "@pi-dash/db/schema/private/party-private";
import { getR2Client } from "@pi-dash/jobs/handlers/r2";
import { eq } from "drizzle-orm";

import { removeDonationFilings } from "../donation-filings-reset";

const SEED_DONOR_ID = "01930000-0000-7000-8000-000000000701";

/** A donor with contact details but no identifier, so the seed needs no encryption key. */
export async function ensureDonorParty(userId: string): Promise<void> {
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
export async function ensureIncomeFixtures(userId: string): Promise<void> {
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
 * registration is cleared so the spec enters it through Settings. Filings
 * an earlier run recorded are removed, so every gift starts unfiled.
 */
export async function ensureReturnFixtures(userId: string): Promise<void> {
  await removeDonationFilings();
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
      // The filings spec emails this donor's certificate (never delivered).
      email: "ready-donor@pi-dash.test",
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
/** A CSR platform (sponsor and intermediary), whose gifts are never receipted. */
const RECEIPT_PLATFORM_ID = "01930000-0000-7000-8000-000000000749";
const RECEIPT_PLATFORM_PAN = "ABCCP1234P";
/** A receipt donor with a phone and no email, so receipts go by WhatsApp. */
const RECEIPT_PHONE_DONOR_ID = "01930000-0000-7000-8000-000000000753";
const RECEIPT_PHONE_DONOR_PAN = "ABCPW1234W";

/**
 * Donation receipt fixtures: fake receipt details in Settings, and a donor
 * with a PAN and an address who gave once by UPI (receiptable here) and
 * once through give.do (receipted by give.do, so never here). Both gifts
 * are dated today. A CSR platform holding the intermediary role (and a
 * sponsor role) gave once by NEFT with full details, so only the role keeps
 * it from a receipt. A donor with a phone and no email gave once by UPI.
 * The 80G registration is left to the spec, which enters
 * it through Settings as the donations return spec does. Fake details only.
 */
export async function ensureReceiptFixtures(userId: string): Promise<void> {
  const now = new Date();
  const todayInIndia = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(now);
  // Receipts print the signatory's signature, so seed the image in R2.
  const signatureKey = `${process.env.R2_KEY_PREFIX}/attachments/receipt-signatures/e2e-receipt-signature.png`;
  await getR2Client().write(
    signatureKey,
    Bun.file(
      path.resolve(
        import.meta.dirname,
        "../../fixtures/images/receipt-signature.png"
      )
    ),
    { type: "image/png" }
  );
  const settings = JSON.stringify({
    orgAddress: "1 Test Road, Testville 560001",
    orgName: "E2E Test Trust",
    orgPan: "AAATE0000E",
    signatoryDesignation: "Test Treasurer",
    signatoryName: "E2E Signatory",
    signatureKey,
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
    phone: "+919999990741",
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

  await db
    .insert(party)
    .values({
      createdAt: now,
      createdBy: userId,
      displayName: "E2E Receipt Platform",
      id: RECEIPT_PLATFORM_ID,
      kind: "organisation",
      updatedAt: now,
    })
    .onConflictDoNothing();
  for (const [id, role] of [
    ["01930000-0000-7000-8000-000000000750", "sponsor"],
    ["01930000-0000-7000-8000-000000000751", "intermediary"],
  ] as const) {
    await db
      .insert(partyRole)
      .values({
        active: true,
        id,
        partyId: RECEIPT_PLATFORM_ID,
        role,
        since: now,
      })
      .onConflictDoUpdate({ set: { active: true }, target: partyRole.id });
  }
  const platformDetails = {
    addressLine1: "3, Platform Road",
    city: "Bengaluru",
    idNumberEncrypted: encryptSecret(
      RECEIPT_PLATFORM_PAN,
      partyIdNumberContext(RECEIPT_PLATFORM_ID)
    ),
    idNumberLast4: visibleTail(RECEIPT_PLATFORM_PAN),
    idType: "pan" as const,
    pincode: "560003",
    state: "Karnataka",
    updatedAt: now,
    updatedBy: userId,
  };
  await db
    .insert(partyPrivate)
    .values({ ...platformDetails, partyId: RECEIPT_PLATFORM_ID })
    .onConflictDoUpdate({ set: platformDetails, target: partyPrivate.partyId });
  await db
    .insert(contribution)
    .values({
      amountPaise: 250_000,
      channel: "neft",
      createdAt: now,
      createdBy: userId,
      fundId: GENERAL_FUND_ID,
      id: "01930000-0000-7000-8000-000000000752",
      orgAccountId: E2E_ORG_ACCOUNT_ID,
      partyId: RECEIPT_PLATFORM_ID,
      receivedOn: todayInIndia,
      reference: "E2E-RECEIPT-PLATFORM",
      reportingMode: "electronic_or_account_payee",
      status: "received",
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(party)
    .values({
      createdAt: now,
      createdBy: userId,
      displayName: "E2E Receipt Phone Donor",
      id: RECEIPT_PHONE_DONOR_ID,
      kind: "person",
      updatedAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(partyRole)
    .values({
      active: true,
      id: "01930000-0000-7000-8000-000000000754",
      partyId: RECEIPT_PHONE_DONOR_ID,
      role: "donor",
      since: now,
    })
    .onConflictDoNothing();
  const phoneDetails = {
    addressLine1: "11, Test Lane",
    city: "Bengaluru",
    email: null,
    idNumberEncrypted: encryptSecret(
      RECEIPT_PHONE_DONOR_PAN,
      partyIdNumberContext(RECEIPT_PHONE_DONOR_ID)
    ),
    idNumberLast4: visibleTail(RECEIPT_PHONE_DONOR_PAN),
    idType: "pan" as const,
    phone: "+919999990753",
    pincode: "560004",
    state: "Karnataka",
    updatedAt: now,
    updatedBy: userId,
  };
  await db
    .insert(partyPrivate)
    .values({ ...phoneDetails, partyId: RECEIPT_PHONE_DONOR_ID })
    .onConflictDoUpdate({ set: phoneDetails, target: partyPrivate.partyId });
  await db
    .insert(contribution)
    .values({
      amountPaise: 140_000,
      channel: "upi",
      createdAt: now,
      createdBy: userId,
      fundId: GENERAL_FUND_ID,
      id: "01930000-0000-7000-8000-000000000755",
      orgAccountId: E2E_ORG_ACCOUNT_ID,
      partyId: RECEIPT_PHONE_DONOR_ID,
      receivedOn: todayInIndia,
      reference: "E2E-RECEIPT-PHONE",
      reportingMode: "electronic_or_account_payee",
      status: "received",
      updatedAt: now,
    })
    .onConflictDoNothing();
}
