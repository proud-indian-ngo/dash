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
import { vendor, vendorPayment } from "@pi-dash/db/schema/vendor";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { canRevealVendorBank, canViewVendorDetails } from "@/lib/vendor-access";
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

async function hasOwnPaymentTo(vendorId: string, userId: string) {
  const [row] = await db
    .select({ id: vendorPayment.id })
    .from(vendorPayment)
    .where(
      and(
        eq(vendorPayment.vendorId, vendorId),
        eq(vendorPayment.userId, userId)
      )
    )
    .limit(1);
  return row !== undefined;
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
    if (
      !(row && canViewVendorDetails(permissions, context.session.user.id, row))
    ) {
      throw new Error("Forbidden");
    }
    return {
      details: await getVendorPrivate(data.vendorId),
      identifiersAvailable: hasEncryptionKey(),
    };
  });

/**
 * The full bank account, for finance staff, approvers and whoever raised a
 * payment request to this vendor. Every reveal is recorded in the audit ledger.
 */
export const revealVendorBankAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ vendorId: z.guid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const permissions = await permissionsOf(context.session);
    const ownsPayment =
      permissions.includes("requests.record_payment") &&
      (await hasOwnPaymentTo(data.vendorId, context.session.user.id));
    if (!canRevealVendorBank(permissions, ownsPayment)) {
      throw new Error("Forbidden");
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
    // A party that also holds another role keeps its party row; the outcome
    // says which happened. Either way it is the same audited vendor.delete.
    const removed = await runSessionAuditedAction(
      context.session,
      context.headers,
      {
        action: "vendor.delete",
        target: { id: data.vendorId, type: "party" },
      },
      async () => await deleteVendorRows(data.vendorId)
    );
    return { removed, vendorId: data.vendorId };
  });
