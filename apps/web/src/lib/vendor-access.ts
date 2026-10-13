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

/**
 * The full account number: finance staff and approvers, who pay vendors, and
 * whoever records payments once they have raised a payment request to this
 * vendor themselves.
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
