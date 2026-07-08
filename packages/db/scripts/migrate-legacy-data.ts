import fs from "node:fs";
import path from "node:path";
import { S3Client } from "bun";
import { eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  process.stderr.write(
    "DATABASE_URL env var is required.\nUsage: DATABASE_URL=postgres://... bun run scripts/migrate-legacy-data.ts\n"
  );
  process.exit(1);
}

// R2 config (optional — skip file copy if not provided)
const { OLD_R2_ACCOUNT_ID } = process.env;
const { OLD_R2_ACCESS_KEY } = process.env;
const { OLD_R2_SECRET_ACCESS_KEY } = process.env;
const { OLD_R2_BUCKET_NAME } = process.env;
const { NEW_R2_ACCOUNT_ID } = process.env;
const { NEW_R2_ACCESS_KEY } = process.env;
const { NEW_R2_SECRET_ACCESS_KEY } = process.env;
const { NEW_R2_BUCKET_NAME } = process.env;
const { NEW_R2_KEY_PREFIX } = process.env;

const R2_ENABLED =
  OLD_R2_ACCOUNT_ID &&
  OLD_R2_ACCESS_KEY &&
  OLD_R2_SECRET_ACCESS_KEY &&
  OLD_R2_BUCKET_NAME &&
  NEW_R2_ACCOUNT_ID &&
  NEW_R2_ACCESS_KEY &&
  NEW_R2_SECRET_ACCESS_KEY &&
  NEW_R2_BUCKET_NAME &&
  NEW_R2_KEY_PREFIX;

// WhatsApp status check config (optional)
const { WHATSAPP_API_URL } = process.env;
const { WHATSAPP_AUTH_USER } = process.env;
const { WHATSAPP_AUTH_PASS } = process.env;
const WHATSAPP_ENABLED = !!WHATSAPP_API_URL;

// biome-ignore lint/performance/noNamespaceImport: intentional
import * as schema from "../src/schema";

const db = drizzle(DATABASE_URL, { schema });

// ── Logging ──────────────────────────────────────────────

const log = (msg: string) => process.stdout.write(`${msg}\n`);
const warn = (msg: string) => process.stderr.write(`WARN: ${msg}\n`);

const stats = {
  advancePaymentAttachments: { migrated: 0, skipped: 0 },
  advancePaymentHistory: { migrated: 0, skipped: 0 },
  advancePayments: { migrated: 0, skipped: 0 },
  bankAccounts: { migrated: 0, skipped: 0 },
  categories: { migrated: 0, skipped: 0 },
  r2Files: { copied: 0, failed: 0, skipped: 0 },
  reimbursementAttachments: { migrated: 0, skipped: 0 },
  reimbursementHistory: { migrated: 0, skipped: 0 },
  reimbursements: { migrated: 0, skipped: 0 },
  users: { migrated: 0, skipped: 0 },
  whatsappChecks: { checked: 0, failed: 0, onWhatsapp: 0, skipped: 0 },
};

// Pending R2 file copies — collected during transaction, executed after commit
interface PendingR2Copy {
  attachmentId: string;
  newKey: string;
  oldKey: string;
  table: "reimbursement_attachment" | "advance_payment_attachment";
}
const pendingR2Copies: PendingR2Copy[] = [];

// Pending WhatsApp checks — collected during transaction, executed after commit
interface PendingWhatsAppCheck {
  phone: string;
  userId: string;
}
const pendingWhatsAppChecks: PendingWhatsAppCheck[] = [];

// ── MySQL Dump Parser ────────────────────────────────────

interface OldUser {
  created_at: string | null;
  dob: string | null;
  email: string;
  gender: string | null;
  id: number;
  is_orientation_attended: number;
  name: string;
  phone: string;
  role_id: number;
  status: number;
  updated_at: string | null;
}

interface OldBankDetail {
  account_name: string;
  account_number: string;
  created_at: string | null;
  deleted_at: string | null;
  id: number;
  ifsc_code: string;
  is_default: number;
  updated_at: string | null;
  user_id: number;
}

interface OldCategory {
  id: number;
  name: string;
}

interface OldReimbursement {
  bank_detail_id: number | null;
  city_belongs_to: number | null;
  cost: string;
  created_at: string | null;
  deleted_at: string | null;
  description: string | null;
  expense_date: string | null;
  id: number;
  name: string;
  poc_id: number | null;
  reimbursement_category_id: number;
  reimbursement_status: string;
  updated_at: string | null;
  user_id: number;
}

interface OldAdvancePayment {
  advance_amount_status: string;
  advance_payment_category_id: number | null;
  bank_detail_id: number | null;
  city_belongs_to: number | null;
  created_at: string | null;
  deleted_at: string | null;
  description: string | null;
  id: number;
  name: string;
  poc_id: number | null;
  remarks: string | null;
  requested_on: string | null;
  total_amount: string;
  updated_at: string | null;
  user_id: number;
}

interface OldAdvancePaymentEntry {
  advance_payment_id: number;
  category_id: number;
  cost: string;
  created_at: string | null;
  id: number;
  poc_id: number;
  remarks: string | null;
  requested_on: string | null;
  updated_at: string | null;
  user_id: number;
}

interface OldFile {
  created_at: string | null;
  deleted_at: string | null;
  external_url: string | null;
  file_name: string | null;
  file_path: string | null;
  file_type: string;
  fileable_id: number;
  fileable_type: string;
  id: number;
  mime_type: string | null;
}

function parseValue(raw: string): string | number | null {
  if (raw === "NULL") {
    return null;
  }
  if (raw.startsWith("'")) {
    // Unescape MySQL string: remove surrounding quotes, handle \' and \\
    let s = raw.slice(1, -1);
    s = s.replace(/\\'/g, "'");
    s = s.replace(/\\\\/g, "\\");
    s = s.replace(/\\n/g, "\n");
    s = s.replace(/\\r/g, "\r");
    return s;
  }
  const n = Number(raw);
  return Number.isNaN(n) ? raw : n;
}

function parseRowFromPosition(
  valuesStr: string,
  start: number
): { values: (string | number | null)[]; end: number } {
  let j = start;
  const values: (string | number | null)[] = [];
  let currentToken = "";
  let inString = false;

  while (j < valuesStr.length) {
    // biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee j < length
    const ch = valuesStr[j]!;

    if (inString) {
      ({ currentToken, j, inString } = handleStringChar(
        ch,
        valuesStr,
        j,
        currentToken
      ));
      continue;
    }

    if (ch === "'") {
      inString = true;
      currentToken += ch;
      j += 1;
      continue;
    }

    if (ch === "," || ch === ")") {
      values.push(parseValue(currentToken.trim()));
      currentToken = "";
      if (ch === ")") {
        j += 1;
        break;
      }
      j += 1;
      continue;
    }

    currentToken += ch;
    j += 1;
  }

  return { end: j, values };
}

function handleStringChar(
  ch: string,
  valuesStr: string,
  j: number,
  currentToken: string
): { currentToken: string; j: number; inString: boolean } {
  if (ch === "\\" && j + 1 < valuesStr.length) {
    return {
      // biome-ignore lint/style/noNonNullAssertion: bounds checked above
      currentToken: currentToken + ch + valuesStr[j + 1]!,
      inString: true,
      j: j + 2,
    };
  }
  if (ch === "'") {
    return { currentToken: currentToken + ch, inString: false, j: j + 1 };
  }
  return { currentToken: currentToken + ch, inString: true, j: j + 1 };
}

function parseInsertValues(valuesStr: string): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];
  let i = 0;

  while (i < valuesStr.length) {
    const openParen = valuesStr.indexOf("(", i);
    if (openParen === -1) {
      break;
    }

    const { values, end } = parseRowFromPosition(valuesStr, openParen + 1);
    rows.push(values);
    i = end;
  }

  return rows;
}

function extractTableInserts(
  sqlContent: string,
  tableName: string
): (string | number | null)[][] {
  const pattern = new RegExp(
    `INSERT INTO \`${tableName}\`\\s*\\([^)]+\\)\\s*VALUES\\s*`,
    "g"
  );
  let allRows: (string | number | null)[][] = [];
  let match: RegExpExecArray | null;

  // biome-ignore lint/suspicious/noAssignInExpressions: intentional
  while ((match = pattern.exec(sqlContent)) !== null) {
    const startIdx = match.index + match[0].length;
    // Find the end of this INSERT statement (semicolon at end of line)
    let endIdx = sqlContent.indexOf(";\n", startIdx);
    if (endIdx === -1) {
      endIdx = sqlContent.length;
    }
    const valuesStr = sqlContent.slice(startIdx, endIdx);
    const rows = parseInsertValues(valuesStr);
    allRows = allRows.concat(rows);
  }

  return allRows;
}

function parseMysqlDump(sqlContent: string) {
  log("Parsing MySQL dump...");

  const usersRaw = extractTableInserts(sqlContent, "users");
  const users: OldUser[] = usersRaw.map((r) => ({
    created_at: r[14] as string | null,
    dob: r[5] as string | null,
    email: r[3] as string,
    gender: r[4] as string | null,
    id: r[0] as number,
    is_orientation_attended: r[13] as number,
    name: r[2] as string,
    phone: r[7] as string,
    role_id: r[1] as number,
    status: r[12] as number,
    updated_at: r[15] as string | null,
  }));

  const bankDetailsRaw = extractTableInserts(sqlContent, "bank_details");
  const bankDetails: OldBankDetail[] = bankDetailsRaw.map((r) => ({
    account_name: r[2] as string,
    account_number: r[3] as string,
    created_at: r[6] as string | null,
    deleted_at: r[8] as string | null,
    id: r[0] as number,
    ifsc_code: r[4] as string,
    is_default: r[5] as number,
    updated_at: r[7] as string | null,
    user_id: r[1] as number,
  }));

  const categoriesRaw = extractTableInserts(
    sqlContent,
    "reimbursement_categories"
  );
  const categories: OldCategory[] = categoriesRaw.map((r) => ({
    id: r[0] as number,
    name: r[1] as string,
  }));

  const reimbursementsRaw = extractTableInserts(
    sqlContent,
    "expense_reimbursements"
  );
  const reimbursements: OldReimbursement[] = reimbursementsRaw.map((r) => ({
    bank_detail_id: r[2] as number | null,
    city_belongs_to: r[8] as number | null,
    cost: String(r[5]),
    created_at: r[11] as string | null,
    deleted_at: r[13] as string | null,
    description: r[7] as string | null,
    expense_date: r[6] as string | null,
    id: r[0] as number,
    name: r[4] as string,
    poc_id: r[9] as number | null,
    reimbursement_category_id: r[3] as number,
    reimbursement_status: r[10] as string,
    updated_at: r[12] as string | null,
    user_id: r[1] as number,
  }));

  const advancePaymentsRaw = extractTableInserts(
    sqlContent,
    "advance_payments"
  );
  const advancePayments: OldAdvancePayment[] = advancePaymentsRaw.map((r) => ({
    advance_amount_status: r[11] as string,
    advance_payment_category_id: r[3] as number | null,
    bank_detail_id: r[2] as number | null,
    city_belongs_to: r[9] as number | null,
    created_at: r[12] as string | null,
    deleted_at: r[14] as string | null,
    description: r[8] as string | null,
    id: r[0] as number,
    name: r[4] as string,
    poc_id: r[10] as number | null,
    remarks: r[7] as string | null,
    requested_on: r[6] as string | null,
    total_amount: String(r[5]),
    updated_at: r[13] as string | null,
    user_id: r[1] as number,
  }));

  const advancePaymentEntriesRaw = extractTableInserts(
    sqlContent,
    "advance_payment_entries"
  );
  const advancePaymentEntries: OldAdvancePaymentEntry[] =
    advancePaymentEntriesRaw.map((r) => ({
      advance_payment_id: r[1] as number,
      category_id: r[4] as number,
      cost: String(r[5]),
      created_at: r[10] as string | null,
      id: r[0] as number,
      poc_id: r[3] as number,
      remarks: r[9] as string | null,
      requested_on: r[6] as string | null,
      updated_at: r[11] as string | null,
      user_id: r[2] as number,
    }));

  const filesRaw = extractTableInserts(sqlContent, "files");
  const files: OldFile[] = filesRaw.map((r) => ({
    created_at: r[9] as string | null,
    deleted_at: r[11] as string | null,
    external_url: r[4] as string | null,
    file_name: r[6] as string | null,
    file_path: r[3] as string | null,
    file_type: r[5] as string,
    fileable_id: r[2] as number,
    fileable_type: r[1] as string,
    id: r[0] as number,
    mime_type: r[7] as string | null,
  }));

  log(
    `Parsed: ${users.length} users, ${bankDetails.length} bank_details, ${categories.length} categories, ${reimbursements.length} reimbursements, ${advancePayments.length} advance_payments, ${advancePaymentEntries.length} advance_payment_entries, ${files.length} files`
  );

  return {
    advancePaymentEntries,
    advancePayments,
    bankDetails,
    categories,
    files,
    reimbursements,
    users,
  };
}

// ── Helpers ──────────────────────────────────────────────

const SENTINEL_DATE = "1970-01-01";
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const PHONE_REGEX = /^\+?[\d\s\-().]+$/;
const DB_PASSWORD_REGEX = /:[^:@]+@/;

function parseTimestamp(ts: string | null): Date {
  if (!ts) {
    return new Date();
  }
  return new Date(`${ts}Z`);
}

async function processSequentially<T>(
  items: Iterable<T>,
  fn: (item: T) => Promise<void>
): Promise<void> {
  await Array.from(items).reduce<Promise<void>>(async (previous, item) => {
    await previous;
    await fn(item);
  }, Promise.resolve());
}

function mapCity(cityId: number | null): "bangalore" | "mumbai" | null {
  if (cityId === 225) {
    return "bangalore";
  }
  if (cityId === 329) {
    return "mumbai";
  }
  return null;
}

function mapGender(g: string | null): "male" | "female" | null {
  if (g === "Male") {
    return "male";
  }
  if (g === "Female") {
    return "female";
  }
  return null;
}

function cleanPhone(
  phone: string | null | undefined,
  seenPhones: Set<string>,
  userId: number,
  userName: string
): string | null {
  let p = phone?.trim() || null;
  if (p === "" || p === "0") {
    p = null;
  }
  // Reject values that don't look like phone numbers (e.g. bcrypt hashes)
  if (p && !PHONE_REGEX.test(p)) {
    warn(
      `Nullifying non-phone value for user ${userId} "${userName}": ${p.slice(0, 20)}...`
    );
    p = null;
  }
  // Strip non-digits and prepend +91 if missing country code
  if (p) {
    const digits = p.replace(/\D/g, "");
    p =
      digits.startsWith("91") && digits.length > 10
        ? `+${digits}`
        : `+91${digits}`;
  }
  if (p && seenPhones.has(p)) {
    warn(`Nullifying duplicate phone for user ${userId} "${userName}": ${p}`);
    p = null;
  }
  if (p) {
    seenPhones.add(p);
  }
  return p;
}

function buildBankSnapshot(
  bankDetailId: number | null,
  bankById: Map<number, OldBankDetail>
): {
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankAccountIfscCode: string | null;
} {
  if (!bankDetailId) {
    return {
      bankAccountIfscCode: null,
      bankAccountName: null,
      bankAccountNumber: null,
    };
  }
  const bank = bankById.get(bankDetailId);
  if (!bank) {
    return {
      bankAccountIfscCode: null,
      bankAccountName: null,
      bankAccountNumber: null,
    };
  }
  return {
    bankAccountIfscCode: bank.ifsc_code.toUpperCase().trim(),
    bankAccountName: bank.account_name.trim(),
    bankAccountNumber: bank.account_number.trim(),
  };
}

function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replaceAll(/[\r\n]/g, "")
    .replaceAll(/[\\/]/g, "-")
    .replaceAll(/"/g, "")
    .replaceAll(/\s+/g, "-");
}

function buildAttachmentValues(
  f: OldFile,
  parentId: string,
  attachmentId: string,
  table: "reimbursement_attachment" | "advance_payment_attachment"
) {
  const isExternal = f.file_type === "external";
  if (isExternal) {
    return {
      filename: null,
      mimeType: null,
      objectKey: null,
      type: "url" as const,
      url: f.external_url,
    };
  }

  // For file attachments: generate new R2 key and queue copy
  if (!R2_ENABLED) {
    return {
      filename: f.file_name,
      mimeType: f.mime_type,
      objectKey: f.file_path,
      type: "file" as const,
      url: null,
    };
  }

  const safeName = sanitizeFilename(f.file_name ?? "attachment");
  const newKey = `${NEW_R2_KEY_PREFIX}/attachments/${parentId}/${uuidv7()}-${safeName}`;

  if (f.file_path) {
    pendingR2Copies.push({ attachmentId, newKey, oldKey: f.file_path, table });
  }

  return {
    filename: f.file_name,
    mimeType: f.mime_type,
    objectKey: newKey,
    type: "file" as const,
    url: null,
  };
}

function mapReimbursementStatus(s: string): "pending" | "approved" {
  if (s === "completed") {
    return "approved";
  }
  return "pending";
}

function mapAdvancePaymentStatus(s: string): "pending" | "approved" {
  if (s === "completed" || s === "fully-paid") {
    return "approved";
  }
  return "pending";
}

// ── Migration Steps ──────────────────────────────────────

async function migrateCategories(
  tx: typeof db,
  categories: OldCategory[]
): Promise<Map<number, string>> {
  log("\n=== Migrating Expense Categories ===");
  const oldToNew = new Map<number, string>();
  const now = new Date();

  await Promise.all(
    categories.map(async (cat) => {
      const newId = uuidv7();
      oldToNew.set(cat.id, newId);

      await tx.insert(schema.expenseCategory).values({
        createdAt: now,
        description: null,
        id: newId,
        name: cat.name,
        updatedAt: now,
      });
      stats.categories.migrated += 1;
    })
  );

  log(`Categories migrated: ${stats.categories.migrated}`);
  return oldToNew;
}

async function migrateUsers(
  tx: typeof db,
  users: OldUser[]
): Promise<Map<number, string>> {
  log("\n=== Migrating Users ===");
  const oldToNew = new Map<number, string>();
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  await processSequentially(users, async (u) => {
    const email = u.email.toLowerCase().trim();

    // Skip invalid emails
    if (!email?.includes("@") || email.includes(" ")) {
      warn(`Skipping user ${u.id} "${u.name}": invalid email "${u.email}"`);
      stats.users.skipped += 1;
      return;
    }

    // Deduplicate by email
    if (seenEmails.has(email)) {
      warn(`Skipping duplicate email user ${u.id} "${u.name}": ${email}`);
      stats.users.skipped += 1;
      return;
    }
    seenEmails.add(email);

    const newId = uuidv7();
    oldToNew.set(u.id, newId);

    // Role mapping: 1=Admin, 6=Reimbursement Finance Lead, 7=Sub-admin → admin
    const role: "admin" | "volunteer" =
      u.role_id === 1 || u.role_id === 6 || u.role_id === 7
        ? "admin"
        : "volunteer";

    const gender = mapGender(u.gender);
    const dob = u.dob && u.dob !== SENTINEL_DATE ? new Date(u.dob) : null;
    const phone = cleanPhone(u.phone, seenPhones, u.id, u.name);

    const createdAt = parseTimestamp(u.created_at);
    const updatedAt = parseTimestamp(u.updated_at);

    await tx.insert(schema.user).values({
      createdAt,
      dob,
      email,
      emailVerified: true,
      gender,
      id: newId,
      isActive: u.status === 1,
      name: u.name.trim(),
      phone,
      role,
      updatedAt,
    });

    // Create account row so Better Auth recognises this user.
    // Password is null — users must use "Forgot Password" on first sign-in.
    await tx.insert(schema.account).values({
      accountId: newId,
      createdAt,
      id: uuidv7(),
      providerId: "credential",
      updatedAt,
      userId: newId,
    });
    stats.users.migrated += 1;

    if (phone) {
      pendingWhatsAppChecks.push({ phone, userId: newId });
    }
  });

  log(
    `Users migrated: ${stats.users.migrated}, skipped: ${stats.users.skipped}`
  );
  return oldToNew;
}

async function migrateBankAccounts(
  tx: typeof db,
  bankDetails: OldBankDetail[],
  userMap: Map<number, string>
): Promise<Map<number, string>> {
  log("\n=== Migrating Bank Accounts ===");
  const oldToNew = new Map<number, string>();

  // Filter out deleted rows
  const active = bankDetails.filter((b) => !b.deleted_at);

  // Group by userId+accountNumber, keep the most recent
  const uniqueKey = (b: OldBankDetail) => `${b.user_id}:${b.account_number}`;
  const byKey = new Map<string, OldBankDetail>();
  for (const b of active) {
    const key = uniqueKey(b);
    const existing = byKey.get(key);
    if (
      !existing ||
      (b.updated_at &&
        (!existing.updated_at || b.updated_at > existing.updated_at))
    ) {
      byKey.set(key, b);
    }
  }

  // Track defaults per user to enforce one-default constraint
  const defaultsByUser = new Set<number>();

  await processSequentially(byKey.values(), async (b) => {
    const newUserId = userMap.get(b.user_id);
    if (!newUserId) {
      warn(`Skipping bank account ${b.id}: user ${b.user_id} not migrated`);
      stats.bankAccounts.skipped += 1;
      return;
    }

    // Validate IFSC
    const ifsc = b.ifsc_code.toUpperCase().trim();
    if (!IFSC_REGEX.test(ifsc)) {
      warn(`Skipping bank account ${b.id}: invalid IFSC "${b.ifsc_code}"`);
      stats.bankAccounts.skipped += 1;
      return;
    }

    // Enforce one default per user
    let isDefault = b.is_default === 1;
    if (isDefault && defaultsByUser.has(b.user_id)) {
      isDefault = false;
    }
    if (isDefault) {
      defaultsByUser.add(b.user_id);
    }

    const newId = uuidv7();
    oldToNew.set(b.id, newId);

    await tx.insert(schema.bankAccount).values({
      accountName: b.account_name.trim(),
      accountNumber: b.account_number.trim(),
      createdAt: parseTimestamp(b.created_at),
      id: newId,
      ifscCode: ifsc,
      isDefault,
      updatedAt: parseTimestamp(b.updated_at),
      userId: newUserId,
    });
    stats.bankAccounts.migrated += 1;
  });

  log(
    `Bank accounts migrated: ${stats.bankAccounts.migrated}, skipped: ${stats.bankAccounts.skipped}`
  );
  return oldToNew;
}

function resolveExpenseDate(r: OldReimbursement): string {
  if (r.expense_date && r.expense_date !== SENTINEL_DATE) {
    return r.expense_date;
  }
  return r.created_at?.split(" ")[0] ?? SENTINEL_DATE;
}

async function insertReimbursementRow(
  tx: typeof db,
  r: OldReimbursement,
  newId: string,
  newUserId: string,
  newCategoryId: string,
  bankById: Map<number, OldBankDetail>,
  userMap: Map<number, string>
): Promise<void> {
  const status = mapReimbursementStatus(r.reimbursement_status);
  const bankSnapshot = buildBankSnapshot(r.bank_detail_id, bankById);
  const reviewedBy = r.poc_id ? userMap.get(r.poc_id) : null;
  const reviewedAt =
    status === "approved" && r.updated_at ? parseTimestamp(r.updated_at) : null;
  const createdAt = parseTimestamp(r.created_at);
  const updatedAt = parseTimestamp(r.updated_at);

  await tx.insert(schema.reimbursement).values({
    city: mapCity(r.city_belongs_to),
    expenseDate: resolveExpenseDate(r),
    id: newId,
    status,
    title: r.name.trim(),
    userId: newUserId,
    ...bankSnapshot,
    ...(reviewedBy ? { reviewedAt, reviewedBy } : {}),
    createdAt,
    submittedAt: createdAt,
    updatedAt,
  });

  await tx.insert(schema.reimbursementLineItem).values({
    amount: r.cost,
    categoryId: newCategoryId,
    createdAt,
    description: r.description?.trim() || null,
    id: uuidv7(),
    reimbursementId: newId,
    sortOrder: 0,
    updatedAt,
  });
}

async function migrateReimbursements(
  tx: typeof db,
  reimbursements: OldReimbursement[],
  userMap: Map<number, string>,
  categoryMap: Map<number, string>,
  bankDetails: OldBankDetail[]
): Promise<Map<number, string>> {
  log("\n=== Migrating Reimbursements ===");
  const oldToNew = new Map<number, string>();

  // Build old bank details lookup
  const bankById = new Map<number, OldBankDetail>();
  for (const b of bankDetails) {
    bankById.set(b.id, b);
  }

  // Filter deleted
  const active = reimbursements.filter((r) => !r.deleted_at);

  await processSequentially(active, async (r) => {
    const newUserId = userMap.get(r.user_id);
    if (!newUserId) {
      warn(`Skipping reimbursement ${r.id}: user ${r.user_id} not migrated`);
      stats.reimbursements.skipped += 1;
      return;
    }

    const newCategoryId = categoryMap.get(r.reimbursement_category_id);
    if (!newCategoryId) {
      warn(
        `Skipping reimbursement ${r.id}: category ${r.reimbursement_category_id} not mapped`
      );
      stats.reimbursements.skipped += 1;
      return;
    }

    const newId = uuidv7();
    oldToNew.set(r.id, newId);

    await insertReimbursementRow(
      tx,
      r,
      newId,
      newUserId,
      newCategoryId,
      bankById,
      userMap
    );
    stats.reimbursements.migrated += 1;
  });

  log(
    `Reimbursements migrated: ${stats.reimbursements.migrated}, skipped: ${stats.reimbursements.skipped}`
  );
  return oldToNew;
}

async function migrateAdvancePayments(
  tx: typeof db,
  advancePayments: OldAdvancePayment[],
  entries: OldAdvancePaymentEntry[],
  userMap: Map<number, string>,
  categoryMap: Map<number, string>,
  bankDetails: OldBankDetail[]
): Promise<Map<number, string>> {
  log("\n=== Migrating Advance Payments ===");
  const oldToNew = new Map<number, string>();

  // Build old bank details lookup
  const bankById = new Map<number, OldBankDetail>();
  for (const b of bankDetails) {
    bankById.set(b.id, b);
  }

  // Group entries by parent id
  const entriesByParent = new Map<number, OldAdvancePaymentEntry[]>();
  for (const e of entries) {
    const existing = entriesByParent.get(e.advance_payment_id) ?? [];
    existing.push(e);
    entriesByParent.set(e.advance_payment_id, existing);
  }

  const active = advancePayments.filter((ap) => !ap.deleted_at);

  await processSequentially(active, async (ap) => {
    const newUserId = userMap.get(ap.user_id);
    if (!newUserId) {
      warn(
        `Skipping advance payment ${ap.id}: user ${ap.user_id} not migrated`
      );
      stats.advancePayments.skipped += 1;
      return;
    }

    const newId = uuidv7();
    oldToNew.set(ap.id, newId);

    const createdAt = parseTimestamp(ap.created_at);
    const updatedAt = parseTimestamp(ap.updated_at);

    await insertAdvancePaymentRow(
      tx,
      ap,
      newId,
      newUserId,
      bankById,
      userMap,
      createdAt,
      updatedAt
    );
    await insertAPLineItemsForParent(
      tx,
      ap,
      newId,
      entriesByParent,
      categoryMap,
      createdAt,
      updatedAt
    );

    stats.advancePayments.migrated += 1;
  });

  log(
    `Advance payments migrated: ${stats.advancePayments.migrated}, skipped: ${stats.advancePayments.skipped}`
  );
  return oldToNew;
}

async function insertAdvancePaymentRow(
  tx: typeof db,
  ap: OldAdvancePayment,
  newId: string,
  newUserId: string,
  bankById: Map<number, OldBankDetail>,
  userMap: Map<number, string>,
  createdAt: Date,
  updatedAt: Date
): Promise<void> {
  const status = mapAdvancePaymentStatus(ap.advance_amount_status);
  const city = mapCity(ap.city_belongs_to);
  const bankSnapshot = buildBankSnapshot(ap.bank_detail_id, bankById);
  const reviewedBy = ap.poc_id ? userMap.get(ap.poc_id) : null;
  const reviewedAt =
    status === "approved" && ap.updated_at
      ? parseTimestamp(ap.updated_at)
      : null;

  await tx.insert(schema.advancePayment).values({
    city,
    id: newId,
    status,
    title: ap.name.trim(),
    userId: newUserId,
    ...bankSnapshot,
    ...(reviewedBy ? { reviewedBy } : {}),
    createdAt,
    reviewedAt,
    submittedAt: createdAt,
    updatedAt,
  });
}

async function insertAPLineItemsForParent(
  tx: typeof db,
  ap: OldAdvancePayment,
  newId: string,
  entriesByParent: Map<number, OldAdvancePaymentEntry[]>,
  categoryMap: Map<number, string>,
  createdAt: Date,
  updatedAt: Date
): Promise<void> {
  const apEntries = entriesByParent.get(ap.id) ?? [];
  if (apEntries.length > 0) {
    await insertAPLineItems(tx, newId, apEntries, categoryMap);
    return;
  }

  // No entries — create a single line item from parent data
  const catId = ap.advance_payment_category_id
    ? categoryMap.get(ap.advance_payment_category_id)
    : null;
  if (catId) {
    await tx.insert(schema.advancePaymentLineItem).values({
      advancePaymentId: newId,
      amount: ap.total_amount,
      categoryId: catId,
      createdAt,
      description: ap.description?.trim() || ap.remarks?.trim() || null,
      id: uuidv7(),
      sortOrder: 0,
      updatedAt,
    });
  }
}

async function insertAPLineItems(
  tx: typeof db,
  apId: string,
  entries: OldAdvancePaymentEntry[],
  categoryMap: Map<number, string>
): Promise<void> {
  await processSequentially(entries.entries(), async ([i, entry]) => {
    const newCategoryId = categoryMap.get(entry.category_id);
    if (!newCategoryId) {
      warn(
        `Skipping AP entry ${entry.id}: category ${entry.category_id} not mapped`
      );
      return;
    }

    const entryCreatedAt = parseTimestamp(entry.created_at);
    const entryUpdatedAt = parseTimestamp(entry.updated_at);

    await tx.insert(schema.advancePaymentLineItem).values({
      advancePaymentId: apId,
      amount: entry.cost,
      categoryId: newCategoryId,
      createdAt: entryCreatedAt,
      description: entry.remarks?.trim() || null,
      id: uuidv7(),
      sortOrder: i,
      updatedAt: entryUpdatedAt,
    });
  });
}

async function migrateAttachments(
  tx: typeof db,
  files: OldFile[],
  reimbursementMap: Map<number, string>,
  advancePaymentMap: Map<number, string>
): Promise<void> {
  log("\n=== Migrating Attachments ===");

  // Filter deleted
  const active = files.filter((f) => !f.deleted_at);

  await processSequentially(active, async (f) => {
    const isReimbursement = f.fileable_type.includes("ExpenseReimbursement");
    const isAdvancePayment = f.fileable_type.includes("AdvancePayment");

    if (!(isReimbursement || isAdvancePayment)) {
      return;
    }

    const createdAt = parseTimestamp(f.created_at);
    const attId = uuidv7();

    if (isReimbursement) {
      const newParentId = reimbursementMap.get(f.fileable_id);
      if (!newParentId) {
        stats.reimbursementAttachments.skipped += 1;
        return;
      }
      const attValues = buildAttachmentValues(
        f,
        newParentId,
        attId,
        "reimbursement_attachment"
      );
      await tx.insert(schema.reimbursementAttachment).values({
        id: attId,
        reimbursementId: newParentId,
        ...attValues,
        createdAt,
      });
      stats.reimbursementAttachments.migrated += 1;
    } else {
      const newParentId = advancePaymentMap.get(f.fileable_id);
      if (!newParentId) {
        stats.advancePaymentAttachments.skipped += 1;
        return;
      }
      const attValues = buildAttachmentValues(
        f,
        newParentId,
        attId,
        "advance_payment_attachment"
      );
      await tx.insert(schema.advancePaymentAttachment).values({
        advancePaymentId: newParentId,
        id: attId,
        ...attValues,
        createdAt,
      });
      stats.advancePaymentAttachments.migrated += 1;
    }
  });

  log(
    `Reimbursement attachments migrated: ${stats.reimbursementAttachments.migrated}, skipped: ${stats.reimbursementAttachments.skipped}`
  );
  log(
    `Advance payment attachments migrated: ${stats.advancePaymentAttachments.migrated}, skipped: ${stats.advancePaymentAttachments.skipped}`
  );
}

async function migrateHistoryRecords(
  tx: typeof db,
  reimbursements: OldReimbursement[],
  advancePayments: OldAdvancePayment[],
  userMap: Map<number, string>,
  reimbursementMap: Map<number, string>,
  advancePaymentMap: Map<number, string>
): Promise<void> {
  log("\n=== Creating History Records ===");

  // Reimbursement history
  const activeReimbursements = reimbursements.filter((r) => !r.deleted_at);
  await processSequentially(activeReimbursements, async (r) => {
    const newReimbId = reimbursementMap.get(r.id);
    const newUserId = userMap.get(r.user_id);
    if (!(newReimbId && newUserId)) {
      return;
    }

    await tx.insert(schema.reimbursementHistory).values({
      action: "created",
      actorId: newUserId,
      createdAt: parseTimestamp(r.created_at),
      id: uuidv7(),
      note: "Migrated from legacy system",
      reimbursementId: newReimbId,
    });
    stats.reimbursementHistory.migrated += 1;
  });

  // Advance payment history
  const activeAPs = advancePayments.filter((ap) => !ap.deleted_at);
  await processSequentially(activeAPs, async (ap) => {
    const newAPId = advancePaymentMap.get(ap.id);
    const newUserId = userMap.get(ap.user_id);
    if (!(newAPId && newUserId)) {
      return;
    }

    await tx.insert(schema.advancePaymentHistory).values({
      action: "created",
      actorId: newUserId,
      advancePaymentId: newAPId,
      createdAt: parseTimestamp(ap.created_at),
      id: uuidv7(),
      note: "Migrated from legacy system",
    });
    stats.advancePaymentHistory.migrated += 1;
  });

  log(`Reimbursement history records: ${stats.reimbursementHistory.migrated}`);
  log(
    `Advance payment history records: ${stats.advancePaymentHistory.migrated}`
  );
}

// ── Purge ────────────────────────────────────────────────

const { ADMIN_EMAIL } = process.env;

async function purgeR2Files(): Promise<void> {
  if (!R2_ENABLED) {
    return;
  }

  log("\n=== Deleting Existing R2 Files ===");

  const newS3 = new S3Client({
    accessKeyId: NEW_R2_ACCESS_KEY as string,
    bucket: NEW_R2_BUCKET_NAME as string,
    endpoint: `https://${NEW_R2_ACCOUNT_ID as string}.r2.cloudflarestorage.com`,
    secretAccessKey: NEW_R2_SECRET_ACCESS_KEY as string,
  });

  const reimbKeys = await db
    .select({ objectKey: schema.reimbursementAttachment.objectKey })
    .from(schema.reimbursementAttachment)
    .where(eq(schema.reimbursementAttachment.type, "file"));

  const apKeys = await db
    .select({ objectKey: schema.advancePaymentAttachment.objectKey })
    .from(schema.advancePaymentAttachment)
    .where(eq(schema.advancePaymentAttachment.type, "file"));

  const allKeys = [...reimbKeys, ...apKeys]
    .map((r) => r.objectKey)
    .filter(
      (k): k is string => k?.startsWith(NEW_R2_KEY_PREFIX as string) === true
    );

  if (allKeys.length === 0) {
    log("  No R2 files to delete");
    return;
  }

  let deleted = 0;
  let failed = 0;
  await Promise.all(
    allKeys.map(async (key) => {
      try {
        await newS3.delete(key);
        deleted += 1;
      } catch {
        failed += 1;
        warn(`Failed to delete R2 file: ${key}`);
      }
    })
  );
  log(`  R2 files deleted: ${deleted}, failed: ${failed}`);
}

async function purgeExistingData(tx: typeof db): Promise<void> {
  log("\n=== Purging Existing Migration Data ===");

  // Delete in reverse dependency order. Cascade handles children,
  // but explicit order makes the log clearer.
  // Attachments + history are cascaded from parent deletes.
  await tx.delete(schema.reimbursement);
  log("  Deleted reimbursements (+ line items, attachments, history)");

  await tx.delete(schema.advancePayment);
  log("  Deleted advance payments (+ line items, attachments, history)");

  await tx.delete(schema.bankAccount);
  log("  Deleted bank accounts");

  await tx.delete(schema.expenseCategory);
  log("  Deleted expense categories");

  // Delete all users except the admin
  if (ADMIN_EMAIL) {
    await tx.delete(schema.user).where(ne(schema.user.email, ADMIN_EMAIL));
    log(`  Deleted users (preserved ${ADMIN_EMAIL})`);
  } else {
    await tx.delete(schema.user);
    log("  Deleted all users (no ADMIN_EMAIL set)");
  }
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  log("=== Legacy Data Migration: MySQL → Postgres ===");
  // biome-ignore lint/style/noNonNullAssertion: early exit above guarantees DATABASE_URL is defined
  log(`Database: ${DATABASE_URL!.replace(DB_PASSWORD_REGEX, ":****@")}`);
  if (ADMIN_EMAIL) {
    log(`Admin user preserved: ${ADMIN_EMAIL}`);
  }

  const dumpPath = path.resolve(
    import.meta.dirname,
    "../../../proudindian.sql"
  );
  if (!fs.existsSync(dumpPath)) {
    throw new Error(`MySQL dump not found at: ${dumpPath}`);
  }

  const sqlContent = fs.readFileSync(dumpPath, "utf-8");
  const parsed = parseMysqlDump(sqlContent);

  // 0. Delete R2 files from previous run (before DB purge removes the keys)
  await purgeR2Files();

  await db.transaction(async (tx) => {
    // 0b. Purge existing DB data
    await purgeExistingData(tx as unknown as typeof db);

    // 1. Categories
    const categoryMap = await migrateCategories(
      tx as unknown as typeof db,
      parsed.categories
    );

    // 2. Users
    const userMap = await migrateUsers(
      tx as unknown as typeof db,
      parsed.users
    );

    // 3. Bank accounts
    await migrateBankAccounts(
      tx as unknown as typeof db,
      parsed.bankDetails,
      userMap
    );

    // 4. Reimbursements + line items
    const reimbursementMap = await migrateReimbursements(
      tx as unknown as typeof db,
      parsed.reimbursements,
      userMap,
      categoryMap,
      parsed.bankDetails
    );

    // 5. Advance payments + line items
    const advancePaymentMap = await migrateAdvancePayments(
      tx as unknown as typeof db,
      parsed.advancePayments,
      parsed.advancePaymentEntries,
      userMap,
      categoryMap,
      parsed.bankDetails
    );

    // 6 & 7. Attachments
    await migrateAttachments(
      tx as unknown as typeof db,
      parsed.files,
      reimbursementMap,
      advancePaymentMap
    );

    // 8. History records
    await migrateHistoryRecords(
      tx as unknown as typeof db,
      parsed.reimbursements,
      parsed.advancePayments,
      userMap,
      reimbursementMap,
      advancePaymentMap
    );
  });

  // 9. Copy R2 files (outside transaction — network I/O)
  await copyR2Files();

  // 10. Check WhatsApp statuses (outside transaction — network I/O)
  await syncWhatsAppStatuses();

  log("\n=== Migration Summary ===");
  for (const [table, counts] of Object.entries(stats)) {
    if (table === "r2Files") {
      const r2 = counts as typeof stats.r2Files;
      log(
        `  ${table}: ${r2.copied} copied, ${r2.skipped} skipped, ${r2.failed} failed`
      );
    } else if (table === "whatsappChecks") {
      const wa = counts as typeof stats.whatsappChecks;
      log(
        `  ${table}: ${wa.checked} checked, ${wa.onWhatsapp} on WhatsApp, ${wa.failed} failed, ${wa.skipped} skipped`
      );
    } else {
      const c = counts as { migrated: number; skipped: number };
      log(`  ${table}: ${c.migrated} migrated, ${c.skipped} skipped`);
    }
  }
  log("\nMigration complete!");
  process.exit(stats.r2Files.failed > 0 ? 1 : 0);
}

function formatPhoneForWhatsApp(phone: string): string {
  return phone.replace(/\D/g, "");
}

async function checkIsOnWhatsApp(phone: string): Promise<boolean> {
  const formatted = formatPhoneForWhatsApp(phone);
  const url = new URL(`${WHATSAPP_API_URL}/user/check`);
  url.searchParams.set("phone", formatted);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (WHATSAPP_AUTH_USER && WHATSAPP_AUTH_PASS) {
    const credentials = btoa(`${WHATSAPP_AUTH_USER}:${WHATSAPP_AUTH_PASS}`);
    headers.Authorization = `Basic ${credentials}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp check API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    results?: { is_on_whatsapp?: boolean };
  };
  return data.results?.is_on_whatsapp ?? false;
}

async function syncWhatsAppStatuses(): Promise<void> {
  if (!WHATSAPP_ENABLED) {
    if (pendingWhatsAppChecks.length > 0) {
      log(
        `\n=== Skipping WhatsApp Checks (${pendingWhatsAppChecks.length} users) ===`
      );
      log("Set WHATSAPP_API_URL to enable WhatsApp status checks.");
      stats.whatsappChecks.skipped = pendingWhatsAppChecks.length;
    }
    return;
  }

  log(
    `\n=== Checking WhatsApp Status (${pendingWhatsAppChecks.length} users) ===`
  );

  await Promise.all(
    pendingWhatsAppChecks.map(async ({ userId, phone }) => {
      try {
        const isOnWhatsapp = await checkIsOnWhatsApp(phone);
        await db
          .update(schema.user)
          .set({ isOnWhatsapp })
          .where(eq(schema.user.id, userId));
        stats.whatsappChecks.checked += 1;
        if (isOnWhatsapp) {
          stats.whatsappChecks.onWhatsapp += 1;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        warn(`WhatsApp check failed for ${phone}: ${msg}`);
        stats.whatsappChecks.failed += 1;
      }

      // Small delay to avoid hammering the WhatsApp Web socket
      await new Promise((resolve) => setTimeout(resolve, 100));
    })
  );

  log(
    `WhatsApp: ${stats.whatsappChecks.checked} checked, ${stats.whatsappChecks.onWhatsapp} on WhatsApp, ${stats.whatsappChecks.failed} failed`
  );
}

async function copyR2Files(): Promise<void> {
  if (!R2_ENABLED) {
    if (pendingR2Copies.length > 0) {
      log(`\n=== Skipping R2 File Copy (${pendingR2Copies.length} files) ===`);
      log("Set OLD_R2_* and NEW_R2_* env vars to enable file copying.");
      stats.r2Files.skipped = pendingR2Copies.length;
    }
    return;
  }

  log(`\n=== Copying R2 Files (${pendingR2Copies.length} files) ===`);

  // R2_ENABLED guard above guarantees these are non-null
  const oldS3 = new S3Client({
    accessKeyId: OLD_R2_ACCESS_KEY as string,
    bucket: OLD_R2_BUCKET_NAME as string,
    endpoint: `https://${OLD_R2_ACCOUNT_ID as string}.r2.cloudflarestorage.com`,
    secretAccessKey: OLD_R2_SECRET_ACCESS_KEY as string,
  });

  const newS3 = new S3Client({
    accessKeyId: NEW_R2_ACCESS_KEY as string,
    bucket: NEW_R2_BUCKET_NAME as string,
    endpoint: `https://${NEW_R2_ACCOUNT_ID as string}.r2.cloudflarestorage.com`,
    secretAccessKey: NEW_R2_SECRET_ACCESS_KEY as string,
  });

  await Promise.all(
    pendingR2Copies.map(async (copy) => {
      const ok = await copyOneFile(oldS3, newS3, copy);
      if (ok) {
        stats.r2Files.copied += 1;
      } else {
        stats.r2Files.failed += 1;
      }
    })
  );

  log(
    `R2 files: ${stats.r2Files.copied} copied, ${stats.r2Files.failed} failed`
  );
}

async function copyOneFile(
  oldS3: InstanceType<typeof S3Client>,
  newS3: InstanceType<typeof S3Client>,
  copy: PendingR2Copy
): Promise<boolean> {
  try {
    const oldFile = oldS3.file(copy.oldKey);
    const data = await oldFile.arrayBuffer();
    await newS3.write(copy.newKey, data);
    log(`  copied: ${copy.oldKey} → ${copy.newKey}`);
    return true;
  } catch (caughtError) {
    const msg =
      caughtError instanceof Error ? caughtError.message : String(caughtError);
    warn(`Failed to copy "${copy.oldKey}": ${msg}`);
    // Revert objectKey in DB back to old key so record isn't broken
    await revertObjectKey(copy);
    return false;
  }
}

async function revertObjectKey(copy: PendingR2Copy): Promise<void> {
  try {
    if (copy.table === "reimbursement_attachment") {
      await db
        .update(schema.reimbursementAttachment)
        .set({ objectKey: copy.oldKey })
        .where(eq(schema.reimbursementAttachment.id, copy.attachmentId));
    } else {
      await db
        .update(schema.advancePaymentAttachment)
        .set({ objectKey: copy.oldKey })
        .where(eq(schema.advancePaymentAttachment.id, copy.attachmentId));
    }
    warn(`  Reverted objectKey for ${copy.attachmentId} to "${copy.oldKey}"`);
  } catch {
    warn(`  Failed to revert objectKey for ${copy.attachmentId}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`\nMIGRATION FAILED: ${message}\n`);
  if (error instanceof Error && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  }
  process.exit(1);
});
