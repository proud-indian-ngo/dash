import { PAST_APPROVAL_STATUSES } from "@pi-dash/zero/vendor-payment-constants";

/**
 * Who may read a vendor's private details and reveal its bank account. The
 * server functions in `functions/vendors.ts` enforce these rules; the vendor
 * screens use the same rules to decide what to show.
 */

export interface VendorAccessRow {
  /** Null once the user who added the vendor has been deleted. */
  createdBy: string | null;
  status: string | null;
}

/**
 * Contact and masked bank details: anyone who sees every vendor, edits
 * vendors or approves payment requests (which may name a pending vendor);
 * for approved vendors, anyone who sees approved vendors or records payments;
 * and the creator of a pending vendor, who entered the details.
 */
export function canViewVendorDetails(
  permissions: readonly string[],
  userId: string,
  row: VendorAccessRow
): boolean {
  if (
    permissions.includes("vendors.view_all") ||
    permissions.includes("vendors.edit") ||
    permissions.includes("requests.approve")
  ) {
    return true;
  }
  if (row.status === "approved") {
    return (
      permissions.includes("vendors.view_approved") ||
      permissions.includes("requests.record_payment")
    );
  }
  return row.createdBy !== null && row.createdBy === userId;
}

export interface VendorPaymentAccessRow {
  status: string;
  userId: string;
}

/**
 * Whether this payment request lets `userId` reveal the vendor's account: they
 * raised it and it has been approved. A pending request does not count, so a
 * throwaway request cannot unlock the account.
 */
export function paymentAllowsVendorReveal(
  userId: string,
  payment: VendorPaymentAccessRow
): boolean {
  return (
    payment.userId === userId && PAST_APPROVAL_STATUSES.has(payment.status)
  );
}

/**
 * The full account number: finance staff and approvers, who pay vendors, and
 * whoever records payments once a payment request they raised to this vendor
 * has been approved (see `paymentAllowsVendorReveal`).
 */
export function canRevealVendorBank(
  permissions: readonly string[],
  ownsPaymentToVendor: boolean
): boolean {
  if (
    permissions.includes("finance.view_sensitive") ||
    permissions.includes("requests.approve")
  ) {
    return true;
  }
  return permissions.includes("requests.record_payment") && ownsPaymentToVendor;
}
