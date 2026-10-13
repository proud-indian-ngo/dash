/**
 * Database errors quote the failing query's parameters, which for Razorpay
 * rows include donor details. Logs and pg-boss job output get only the
 * error's name and Postgres code from here.
 */
export function safeErrorFields(error: unknown): {
  errorCode: string | null;
  errorName: string;
} {
  const seen = new Set<unknown>();
  let current: unknown = error;
  let code: string | null = null;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const candidate = (current as { code?: unknown }).code;
    if (typeof candidate === "string" && /^[0-9A-Z]{5}$/.test(candidate)) {
      code = candidate;
      break;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return {
    errorCode: code,
    errorName: error instanceof Error ? error.name : typeof error,
  };
}

/** An error safe to log or store: name and code, never the message. */
export function sanitizedError(error: unknown, context: string): Error {
  const { errorCode, errorName } = safeErrorFields(error);
  return new Error(
    `${context}: ${errorName}${errorCode ? ` (${errorCode})` : ""}`
  );
}
