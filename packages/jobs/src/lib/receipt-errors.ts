const SQLSTATE = /^[0-9A-Z]{5}$/;
const SAFE_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Receipt query/PDF failures can quote full donor details; jobs persist errors. */
export function safeReceiptJobError(error: unknown, operation: string): Error {
  const errorName =
    error instanceof Error && SAFE_NAME.test(error.name)
      ? error.name
      : typeof error;
  let current: unknown = error;
  let sqlState: string | undefined;
  for (let depth = 0; depth < 4 && current instanceof Object; depth += 1) {
    const candidate = current as {
      cause?: unknown;
      code?: unknown;
      errno?: unknown;
    };
    for (const code of [candidate.code, candidate.errno]) {
      if (typeof code === "string" && SQLSTATE.test(code)) {
        sqlState = code;
        break;
      }
    }
    if (sqlState) {
      break;
    }
    current = candidate.cause;
  }
  return new Error(
    `${operation}: ${errorName}${sqlState ? ` (${sqlState})` : ""}`
  );
}
