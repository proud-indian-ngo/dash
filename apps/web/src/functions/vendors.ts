import { db } from "@pi-dash/db";
import { hasEncryptionKey } from "@pi-dash/db/encryption";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import {
  deleteVendor as deleteVendorRows,
  getVendorPrivate,
  revealVendorBankAccount as revealVendorBankAccountRow,
  saveVendor as saveVendorRows,
  type VendorPrivateView,
} from "@pi-dash/db/queries/vendor-party";
import { vendor } from "@pi-dash/db/schema/vendor";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { saveVendorSchema } from "@/lib/vendor-schema";
import { authMiddleware } from "@/middleware/auth";

/**
 * A vendor's contact, PAN and bank details live in the private party tables,
 * outside the Zero schema, so vendor screens read and write them through these
 * server functions. The synced `vendor` row keeps only the supplier profile
 * (name, GSTIN, approval status); approval still moves through Zero.
 */

export interface VendorDetailsResponse {
  details: VendorPrivateView | null;
  /** False when DATA_ENCRYPTION_KEY is missing; the form then disables PAN and account number. */
  identifiersAvailable: boolean;
}

async function permissionsOf(session: { user: { role?: string | null } }) {
  return await resolvePermissions(session.user.role ?? "unoriented_volunteer");
}

async function findVendor(vendorId: string) {
  const [row] = await db
    .select({ createdBy: vendor.createdBy, status: vendor.status })
    .from(vendor)
    .where(eq(vendor.id, vendorId))
    .limit(1);
  return row ?? null;
}

/**
 * Who may see a vendor's contact and masked bank details: anyone who sees
 * every vendor or may edit them; for approved vendors, anyone who sees
 * approved vendors or records payments to them; and the creator of a pending
 * vendor, who entered the details.
 */
function canViewVendor(
  permissions: readonly string[],
  userId: string,
  row: { createdBy: string; status: string | null }
): boolean {
  if (
    permissions.includes("vendors.view_all") ||
    permissions.includes("vendors.edit")
  ) {
    return true;
  }
  if (row.status === "approved") {
    return (
      permissions.includes("vendors.view_approved") ||
      permissions.includes("requests.record_payment")
    );
  }
  return row.createdBy === userId;
}

/** POST so the personal data in the response is never cached along the way. */
export const getVendorDetails = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ vendorId: z.guid().nullable() }))
  .handler(async ({ context, data }): Promise<VendorDetailsResponse> => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const permissions = await permissionsOf(context.session);
    if (data.vendorId === null) {
      // The create form only needs to know whether identifiers can be stored.
      if (
        !(
          permissions.includes("vendors.create") ||
          permissions.includes("vendors.view_all") ||
          permissions.includes("vendors.view_approved")
        )
      ) {
        throw new Error("Forbidden");
      }
      return { details: null, identifiersAvailable: hasEncryptionKey() };
    }
    const row = await findVendor(data.vendorId);
    if (!(row && canViewVendor(permissions, context.session.user.id, row))) {
      throw new Error("Forbidden");
    }
    return {
      details: await getVendorPrivate(data.vendorId),
      identifiersAvailable: hasEncryptionKey(),
    };
  });

/**
 * The full bank account, for finance staff and, once the vendor is approved,
 * for whoever records the payment. Every reveal is recorded in the audit ledger.
 */
export const revealVendorBankAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ vendorId: z.guid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const permissions = await permissionsOf(context.session);
    if (!permissions.includes("finance.view_sensitive")) {
      const row = await findVendor(data.vendorId);
      if (
        !(
          row?.status === "approved" &&
          permissions.includes("requests.record_payment")
        )
      ) {
        throw new Error("Forbidden");
      }
    }
    return await runSessionAuditedAction(
      context.session,
      context.headers,
      {
        action: "vendor.bank_account.reveal",
        target: { id: data.vendorId, type: "party" },
      },
      async () => ({
        account: await revealVendorBankAccountRow(data.vendorId),
      })
    );
  });

export const saveVendor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(saveVendorSchema)
  .handler(async ({ context, data }) => {
    await assertServerPermission(
      context.session,
      data.mode === "create" ? "vendors.create" : "vendors.edit"
    );
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    const result = await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: data.mode === "create" ? "vendor.create" : "vendor.update",
        target: { id: data.id, type: "party" },
      },
      async () => await saveVendorRows(data, session.user.id)
    );
    return {
      created: result.created,
      vendorId: result.vendorId,
      view: result.view,
    };
  });

export const deleteVendor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ vendorId: z.guid() }))
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "vendors.delete");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    await runSessionAuditedAction(
      context.session,
      context.headers,
      {
        action: "vendor.delete",
        target: { id: data.vendorId, type: "party" },
      },
      async () => await deleteVendorRows(data.vendorId)
    );
    return { vendorId: data.vendorId };
  });
