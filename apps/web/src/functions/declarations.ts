import { db } from "@pi-dash/db";
import { insertGovernanceDocument } from "@pi-dash/db/queries/governance";
import {
  paymentGovernanceWarnings,
  saveConflictDeclaration,
} from "@pi-dash/db/queries/policies";
import { loadRegister } from "@pi-dash/db/queries/resolutions";
import { vendor, vendorPayment } from "@pi-dash/db/schema/vendor";
import { env } from "@pi-dash/env/server";
import { generateConflictDeclarationPdf } from "@pi-dash/pdf/conflict-declaration.tsx";
import { fiscalYearLabel } from "@pi-dash/shared/compliance";
import {
  DECLARATION_FIELD_MAX,
  DECLARATION_INTERESTS_MAX,
} from "@pi-dash/shared/declarations";
import {
  boardOn,
  DOCUMENT_TITLE_MAX,
  TRUSTEE_OFFICE_LABELS,
} from "@pi-dash/shared/governance";
import { todayInKolkata } from "@pi-dash/shared/income";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { sha256Of } from "@/lib/governance/circulars";
import { getS3 } from "@/lib/s3";
import { authMiddleware } from "@/middleware/auth";

/**
 * Yearly declarations of interests (clause 5.3) and the warning finance
 * sees when a payment's payee is a trustee or a declared related party.
 */

class DeclarationError extends Error {}

function userFacing<T>(run: () => Promise<T>): Promise<T> {
  return run().catch((error: unknown) => {
    if (error instanceof DeclarationError) {
      throw new Error(error.message);
    }
    throw error;
  });
}

const startsFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

const field = z.string().trim().max(DECLARATION_FIELD_MAX);

/**
 * The signed-in trustee declares their interests for the current financial
 * year, or that they have none. Makes the PDF, files it in the vault and
 * replaces any earlier declaration for the year.
 */
export const submitConflictDeclarationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      interests: z
        .array(
          z.object({
            nature: field,
            party: field.min(1, "Name the person or organisation"),
            relationship: field.min(1, "Say how you're connected"),
          })
        )
        .max(DECLARATION_INTERESTS_MAX),
    })
  )
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "governance.declare_interests",
        metadata: { interests: data.interests.length },
        target: { id: session.user.id, type: "user" },
      },
      () =>
        userFacing(async () => {
          const today = todayInKolkata();
          const fiscalYear = fiscalYearLabel(today);
          const register = await loadRegister(db, today);
          const member = boardOn(register, today).find(
            (m) => m.trustee.userId === session.user.id
          );
          if (!member) {
            throw new DeclarationError(
              "Only a trustee in office declares interests."
            );
          }
          const now = new Date();
          const pdf = new Uint8Array(
            await generateConflictDeclarationPdf({
              declaredAt: startsFmt.format(now),
              declaredOn: today,
              fiscalYear,
              interests: data.interests,
              org: {
                address: env.VOUCHER_ORG_ADDRESS,
                name: env.VOUCHER_ORG_NAME,
              },
              trustee: {
                name: member.trustee.legalName,
                offices: member.offices
                  .map((o) => TRUSTEE_OFFICE_LABELS[o])
                  .join(", "),
              },
            })
          );
          const sha256 = sha256Of(pdf);
          const objectKey = `${env.R2_KEY_PREFIX}/governance/declarations/${member.trustee.id}/${fiscalYear}-${sha256.slice(0, 12)}.pdf`;
          const s3 = await getS3();
          await s3.write(objectKey, pdf, { type: "application/pdf" });
          const documentId = await insertGovernanceDocument({
            contentType: "application/pdf",
            datedOn: today,
            kind: "declaration",
            note: `Confirmed in the dashboard by ${member.trustee.legalName}.`,
            objectKey,
            originalFilename: `declaration-${fiscalYear}.pdf`,
            sha256,
            sizeBytes: pdf.byteLength,
            sourceFormat: "pdf",
            title:
              `Declaration of interests ${fiscalYear}: ${member.trustee.legalName}`.slice(
                0,
                DOCUMENT_TITLE_MAX
              ),
            uploadedBy: session.user.id,
            validationReport: null,
          });
          await saveConflictDeclaration({
            declaredBy: session.user.id,
            documentId,
            fiscalYear,
            interests: data.interests,
            trusteeId: member.trustee.id,
          });
          return { fiscalYear };
        })
    );
  });

/**
 * The governance warnings on a vendor payment, for whoever approves it:
 * the vendor is a trustee in office, or a party a trustee declared for the
 * year. A read; not audited.
 */
export const getPaymentGovernanceWarnings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ vendorPaymentId: z.guid() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    await assertServerPermission(context.session, "requests.approve");
    const [row] = await db
      .select({ invoiceDate: vendorPayment.invoiceDate, name: vendor.name })
      .from(vendorPayment)
      .innerJoin(vendor, eq(vendor.id, vendorPayment.vendorId))
      .where(eq(vendorPayment.id, data.vendorPaymentId))
      .limit(1);
    if (!row) {
      return [];
    }
    const on = row.invoiceDate ?? todayInKolkata();
    return await paymentGovernanceWarnings(row.name, on, fiscalYearLabel(on));
  });
