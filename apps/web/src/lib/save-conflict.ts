import { PARTY_SAVE_CONFLICT_PREFIX } from "@pi-dash/shared/constants";

/**
 * True when a party save failed because someone else saved the record first
 * (the version check in `packages/db/src/party-save-rules.ts`).
 */
export function isSaveConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith(PARTY_SAVE_CONFLICT_PREFIX)
  );
}
