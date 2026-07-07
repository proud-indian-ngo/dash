import { INVOICE_LOCKED_STATUSES } from "@pi-dash/zero/vendor-payment-constants";

type RequestEditPermission =
  | "requests.edit_own"
  | "requests.edit_all"
  | "requests.edit_all_statuses";

type HasPermission = (permission: RequestEditPermission) => boolean;

interface EditableRequest {
  status: string | null;
  userId: string | null;
}

export function canEditRequestSubmission(
  request: EditableRequest,
  currentUserId: string,
  hasPermission: HasPermission
): boolean {
  if (hasPermission("requests.edit_all_statuses")) {
    return true;
  }

  if (request.status !== "pending") {
    return false;
  }

  return (
    hasPermission("requests.edit_all") ||
    (request.userId === currentUserId && hasPermission("requests.edit_own"))
  );
}

export function canEditVendorPaymentSubmission(
  request: EditableRequest,
  currentUserId: string,
  hasPermission: HasPermission
): boolean {
  if (hasPermission("requests.edit_all_statuses")) {
    return true;
  }

  if (
    request.status === "pending" &&
    request.userId === currentUserId &&
    hasPermission("requests.edit_own")
  ) {
    return true;
  }

  return (
    hasPermission("requests.edit_all") &&
    !INVOICE_LOCKED_STATUSES.has(request.status ?? "")
  );
}
