import { EncryptedValueUnreadableError } from "@pi-dash/db/encryption";
import { unreadableValueMessage } from "@pi-dash/shared/encrypted-values";
import { createRequestLogger } from "evlog";

/**
 * Runs a reveal and turns a value the current key cannot open into a
 * structured server error (`reason: encrypted_value_unreadable`, entity IDs
 * only, never the value) and a message the person can act on. Other errors
 * pass through unchanged. Call it inside the audited action, so the failed
 * reveal is still recorded.
 */
export async function mapUnreadableValue<T>(
  options: {
    action: string;
    /** IDs naming the record; never values. */
    ids: Record<string, string>;
    path: string;
    what: "account number" | "ID number";
  },
  reveal: () => Promise<T>
): Promise<T> {
  try {
    return await reveal();
  } catch (error) {
    if (!(error instanceof EncryptedValueUnreadableError)) {
      throw error;
    }
    const log = createRequestLogger({ method: "POST", path: options.path });
    log.set({ action: options.action, reason: error.reason, ...options.ids });
    log.error(error);
    log.emit();
    throw new Error(unreadableValueMessage(options.what));
  }
}
