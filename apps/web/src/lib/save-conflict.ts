/**
 * True when a party save failed because someone else saved the record first
 * (the version check in `packages/db/src/party-save-rules.ts`).
 */
export function isSaveConflict(error: unknown): boolean {
  return (
    error instanceof Error && error.message.startsWith("Someone else changed")
  );
}
