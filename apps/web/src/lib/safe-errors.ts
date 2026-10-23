import { createRequestLogger } from "evlog";

import { HttpError } from "@/lib/http-error";

/**
 * Server-only. Errors from paths that handle donor data (contribution
 * imports, Razorpay ingestion) reduced to what can be logged or stored. A
 * query error's message, detail and params quote the statement's
 * parameters, here row cells and payment details, so they are never read.
 */

const SQLSTATE = /^[0-9A-Z]{5}$/;
const DB_NAME = /^[a-z_][a-z0-9_]{0,62}$/i;

/**
 * The Postgres error code and the names of the constraint and table, read
 * from the error or its causes.
 */
export function databaseErrorFields(error: unknown): Record<string, string> {
  const fields: Record<string, string> = {};
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Object; depth += 1) {
    const e = current as Record<string, unknown>;
    for (const candidate of [e.errno, e.code]) {
      if (
        !fields.sqlState &&
        typeof candidate === "string" &&
        SQLSTATE.test(candidate)
      ) {
        fields.sqlState = candidate;
      }
    }
    for (const name of ["constraint", "table"] as const) {
      const value = e[name];
      if (!fields[name] && typeof value === "string" && DB_NAME.test(value)) {
        fields[name] = value;
      }
    }
    current = e.cause;
  }
  return fields;
}

/** The error's class name, or its type when it is not an Error. */
export function safeErrorName(error: unknown): string {
  return error instanceof Error && DB_NAME.test(error.name)
    ? error.name
    : typeof error;
}

/**
 * An error safe to log or to hand to pg-boss, which stores what a job
 * throws: the context, the error's name and Postgres code, no message and
 * no cause.
 */
export function sanitizedError(error: unknown, context: string): Error {
  const { sqlState } = databaseErrorFields(error);
  return new Error(
    `${context}: ${safeErrorName(error)}${sqlState ? ` (${sqlState})` : ""}`
  );
}

export interface SafeErrorOptions {
  /** Logged with the error; IDs and step names only. */
  fields: Record<string, string>;
  /** Errors written for the user, refused with their message as a 409. */
  isUserFacing: (error: unknown) => boolean;
  /** The generic message that replaces any other error. */
  message: string;
  path: string;
}

/**
 * Runs `work` and lets only errors written for the user through: an
 * HttpError as it is, any other as a 409 with only its message, so Error
 * Tracking skips both. Anything else is logged by name, code, constraint and
 * table and replaced by a generic error with no cause, so neither the logs,
 * the audit runner nor the browser sees its message.
 */
export async function withSafeErrors<T>(
  options: SafeErrorOptions,
  work: () => Promise<T>
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    if (error instanceof Error && options.isUserFacing(error)) {
      throw new HttpError(409, error.message);
    }
    const safe = new Error(options.message);
    const log = createRequestLogger({ method: "POST", path: options.path });
    log.set({
      ...options.fields,
      errorName: safeErrorName(error),
      ...databaseErrorFields(error),
    });
    log.error(safe);
    log.emit();
    throw safe;
  }
}
