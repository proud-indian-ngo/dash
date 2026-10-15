import { formatCashVoucherLimit } from "./cash-voucher";
import { todayInKolkata } from "./income";
import { formatReceiptDate } from "./receipts";

/**
 * The payee of a cash voucher signs on the volunteer's phone. The statement
 * shown above the pad is stored word for word with the signature, so the
 * record says exactly what the payee acknowledged.
 */
export interface PayeeSignatureFacts {
  amountPaise: number;
  /** The expense category, used when the item has no description. */
  categoryName: string | null | undefined;
  description: string | null | undefined;
  /** The request's expense date: epoch milliseconds or `YYYY-MM-DD`. */
  expenseDate: number | string;
  payeeName: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const TRAILING_STOPS = /[\s.]+$/;
const SPACES = /\s+/g;

/** The calendar day of the expense in India, `YYYY-MM-DD`. */
export function signatureExpenseDay(expenseDate: number | string): string {
  if (typeof expenseDate === "string") {
    return ISO_DAY.test(expenseDate) ? expenseDate : "";
  }
  return Number.isFinite(expenseDate)
    ? todayInKolkata(new Date(expenseDate))
    : "";
}

/** What the money was for: the description, else the category. */
function purposeOf(facts: PayeeSignatureFacts): string {
  const text =
    facts.description?.trim() || facts.categoryName?.trim() || "this expense";
  return text.replace(SPACES, " ").replace(TRAILING_STOPS, "");
}

/**
 * "I, Ramesh Kumar, received ₹500 from Proud Indian for Cleaning the hall
 * on 12 Oct 2026." The client shows it and the server rebuilds it from the
 * stored item, so a signature never records facts the item no longer holds.
 */
export function payeeSignatureStatement(facts: PayeeSignatureFacts): string {
  const day = signatureExpenseDay(facts.expenseDate);
  const date = day ? formatReceiptDate(day) : "the day of payment";
  return `I, ${facts.payeeName.trim()}, received ${formatCashVoucherLimit(facts.amountPaise)} from Proud Indian for ${purposeOf(facts)} on ${date}.`;
}

/** The consent line under the confirm button. */
export const PAYEE_SIGNATURE_CONSENT =
  "By signing, the payee confirms they received this amount.";

/** The signature file is a PNG the dashboard draws; nothing else is taken. */
export const PAYEE_SIGNATURE_MIME_TYPE = "image/png";

/** A drawn signature is small; anything bigger isn't one. */
export const PAYEE_SIGNATURE_MAX_BYTES = 512 * 1024;

/**
 * The pad exports at most 1200 × 600 pixels (the whole 2:1 pad), cropped to
 * the ink. A PNG declaring more is refused before anything decodes it: a
 * small file can declare a huge image that takes gigabytes to inflate.
 */
export const PAYEE_SIGNATURE_MAX_WIDTH = 1200;
export const PAYEE_SIGNATURE_MAX_HEIGHT = 600;
/** Smallest side, and smallest longest side, of a real signature crop. */
const MIN_SIDE = 16;
const MIN_LONG_SIDE = 64;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** "IHDR" in ASCII. */
const IHDR = [0x49, 0x48, 0x44, 0x52];

export interface PngHeader {
  bitDepth: number;
  colourType: number;
  height: number;
  interlace: number;
  width: number;
}

/** The PNG's header (IHDR), or null when the bytes don't start a PNG. */
export function readPngHeader(bytes: Uint8Array): PngHeader | null {
  if (bytes.length < 29) {
    return null;
  }
  const at = (i: number) => bytes[i] ?? 0;
  const u32 = (i: number) =>
    ((at(i) << 24) | (at(i + 1) << 16) | (at(i + 2) << 8) | at(i + 3)) >>> 0;
  if (
    PNG_MAGIC.some((byte, i) => at(i) !== byte) ||
    u32(8) !== 13 ||
    IHDR.some((byte, i) => at(12 + i) !== byte)
  ) {
    return null;
  }
  return {
    bitDepth: at(24),
    colourType: at(25),
    height: u32(20),
    interlace: at(28),
    width: u32(16),
  };
}

export type PayeeSignatureImageProblem =
  | "not_png"
  | "too_large"
  | "too_small"
  | "unsupported_format";

/**
 * Why a file can't be a signature the pad drew, or null when it can: a
 * non-interlaced 8-bit RGB or RGBA PNG (browsers export the white-backed
 * canvas as either) within the pad's size and the byte cap. Checked when
 * the upload is claimed and again before the voucher decodes it.
 */
export function payeeSignatureImageProblem(
  bytes: Uint8Array,
  byteSize: number = bytes.length
): PayeeSignatureImageProblem | null {
  if (byteSize > PAYEE_SIGNATURE_MAX_BYTES) {
    return "too_large";
  }
  const header = readPngHeader(bytes);
  if (!header) {
    return "not_png";
  }
  if (
    header.width > PAYEE_SIGNATURE_MAX_WIDTH ||
    header.height > PAYEE_SIGNATURE_MAX_HEIGHT
  ) {
    return "too_large";
  }
  if (
    header.width < MIN_SIDE ||
    header.height < MIN_SIDE ||
    Math.max(header.width, header.height) < MIN_LONG_SIDE
  ) {
    return "too_small";
  }
  if (
    header.bitDepth !== 8 ||
    !(header.colourType === 2 || header.colourType === 6) ||
    header.interlace !== 0
  ) {
    return "unsupported_format";
  }
  return null;
}

/** The facts a payee signs against; the server compares them with the item. */
export interface PayeeSignatureSignedFacts {
  amountPaise: number;
  categoryId: string;
  description: string;
  /** The expense day in India, `YYYY-MM-DD`. */
  expenseDay: string;
  payeeName: string;
}
