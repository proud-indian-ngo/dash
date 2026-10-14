import type { ImportBatchSource } from "@pi-dash/shared/constants";

/** The two fields of the upload form the give.do default reads and writes. */
interface DepositAccountForm {
  getFieldValue: (name: "source") => ImportBatchSource;
  setFieldValue: (
    name: "orgAccountId",
    value: string | undefined,
    options: { dontRunListeners: true }
  ) => void;
}

/**
 * Sets "Deposited into" to what the source implies until the user picks an
 * account: the give.do clearing account for give.do, nothing for any other
 * source. Call it when the source changes and when the accounts sync, in
 * either order. It writes without running listeners, so the form's
 * `orgAccountId` listener sees only the user's own picks.
 */
export function applyDepositAccountDefault(
  form: DepositAccountForm,
  giveDoAccountId: string | undefined,
  userPicked: boolean
): void {
  if (userPicked) {
    return;
  }
  const giveDo = form.getFieldValue("source") === "give_do_csv";
  if (giveDo && !giveDoAccountId) {
    // Wait for the accounts; the user can still pick one meanwhile.
    return;
  }
  form.setFieldValue("orgAccountId", giveDo ? giveDoAccountId : undefined, {
    dontRunListeners: true,
  });
}
