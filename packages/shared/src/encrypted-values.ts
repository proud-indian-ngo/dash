/**
 * Shown when a stored identifier cannot be decrypted with the key the app
 * runs with (`encrypted_value_unreadable` in the server log); the fix is the
 * key check in DEPLOYMENT.md, "Encryption key mismatch: check and rekey".
 */
export const unreadableValueMessage = (
  what: "account number" | "ID number" | "PAN or Aadhaar reference"
) =>
  `This ${what} was saved with a different encryption key. Ask an administrator to run the key check (see DEPLOYMENT.md).`;

/** The message to toast after a failed reveal: the key message, or `fallback`. */
export function revealErrorMessage(
  error: unknown,
  what: "account number" | "ID number" | "PAN or Aadhaar reference",
  fallback: string
): string {
  const expected = unreadableValueMessage(what);
  return error instanceof Error && error.message === expected
    ? expected
    : fallback;
}
