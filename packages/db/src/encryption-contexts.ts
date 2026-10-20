/**
 * The associated data each encrypted column binds its values to (see
 * `encryptSecret`). A value only decrypts under the context of the row it
 * was written for, so these strings must never change. Kept apart from the
 * query modules so key checks can use them without opening a connection.
 */

/** `private.party_private.id_number_encrypted`, keyed by party ID. */
export const partyIdNumberContext = (partyId: string) =>
  `party_private.id_number:${partyId}`;

/** `private.party_bank_account.account_number_encrypted`, keyed by account ID. */
export const accountNumberContext = (accountId: string) =>
  `party_bank_account.account_number:${accountId}`;

/** `private.contribution_receipt_snapshot.id_number_encrypted`, keyed by receipt ID. */
export const snapshotIdContext = (receiptId: string) =>
  `contribution_receipt_snapshot.id_number:${receiptId}`;

/** `private.trustee_private.pan_encrypted`, keyed by trustee ID. */
export const trusteePanContext = (trusteeId: string) =>
  `trustee_private.pan:${trusteeId}`;

/** `private.trustee_private.aadhaar_reference_encrypted`, keyed by trustee ID. */
export const trusteeAadhaarContext = (trusteeId: string) =>
  `trustee_private.aadhaar_reference:${trusteeId}`;
