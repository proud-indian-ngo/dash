import { db } from "@pi-dash/db";
import {
  DeclarationError,
  getConflictDeclaration,
  paymentGovernanceWarnings,
  saveDeclarationAwaitingSignature,
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
import { boardOn, TRUSTEE_OFFICE_LABELS } from "@pi-dash/shared/governance";
import { todayInKolkata } from "@pi-dash/shared/income";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import {
  acceptSignedDeclaration,
  declarationKey,
} from "@/lib/governance/accept-signature";
import {
  assertOwnSignedUpload,
  CircularError,
  fieldRequests,
  sha256Of,
} from "@/lib/governance/circulars";
import {
  prepareSignatureFields,
  SigningServiceError,
} from "@/lib/governance/signing-service";
import { HttpError } from "@/lib/http-error";
import { readGovernanceUpload } from "@/lib/r2-upload-claim";
import { getS3 } from "@/lib/s3";
import { createTemporaryUpload } from "@/lib/temporary-upload";
import { authMiddleware } from "@/middleware/auth";

/**
 * Yearly declarations of interests (clause 5.3), signed by each trustee
 * with their DSC, and the warning finance sees when a payment's payee is a
 * trustee or a declared related party.
 */

function userFacing<T>(run: () => Promise<T>): Promise<T> {
  return run().catch((error: unknown) => {
    if (
      error instanceof CircularError ||
      error instanceof DeclarationError ||
      error instanceof SigningServiceError
    ) {
      throw new HttpError(409, error.message);
    }
    throw error;
  });
}

const field = z.string().trim().max(DECLARATION_FIELD_MAX);

/**
 * The signed-in trustee declares their interests for the current financial
 * year, or that they have none. Makes the PDF with their empty signature
 * field and keeps it waiting for their signature, replacing one still
 * waiting.
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
      throw new HttpError(401, "Unauthorized");
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
          const rendered = await generateConflictDeclarationPdf({
            declaredOn: today,
            fiscalYear,
            interests: data.interests,
            org: {
              address: env.VOUCHER_ORG_ADDRESS,
              name: env.VOUCHER_ORG_NAME,
            },
            trustee: {
              id: member.trustee.id,
              name: member.trustee.legalName,
              offices: member.offices
                .map((o) => TRUSTEE_OFFICE_LABELS[o])
                .join(", "),
            },
          });
          const pdf = await prepareSignatureFields(
            new Uint8Array(rendered),
            fieldRequests([member.trustee.id])
          );
          const sha256 = sha256Of(pdf);
          const objectKey = declarationKey(
            member.trustee.id,
            `${fiscalYear}-${sha256.slice(0, 12)}.pdf`
          );
          const s3 = await getS3();
          await s3.write(objectKey, pdf, { type: "application/pdf" });
          await saveDeclarationAwaitingSignature({
            declaredBy: session.user.id,
            fiscalYear,
            interests: data.interests,
            objectKey,
            sha256,
            trusteeId: member.trustee.id,
          });
          return { fiscalYear };
        })
    );
  });

/** Only the trustee a declaration belongs to files their signed copy. */
async function assertOwnDeclaration(declarationId: string, userId: string) {
  const row = await getConflictDeclaration(declarationId);
  if (row?.userId !== userId) {
    throw new DeclarationError(
      "Only the trustee who declared signs the declaration."
    );
  }
}

export const getDeclarationUploadUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      fileName: z.string().trim().min(1).max(200),
      fileSize: z
        .number()
        .int()
        .positive()
        .max(25 * 1024 * 1024),
      id: z.uuid(),
    })
  )
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    return await createTemporaryUpload(
      {
        fileName: data.fileName,
        keyPrefix: env.R2_KEY_PREFIX,
        mimeType: "application/pdf",
        scope: { kind: "governanceDocument" },
        subfolder: "governance",
        user: session.user,
      },
      {
        authorize: async () => {
          await assertOwnDeclaration(data.id, session.user.id);
        },
        presign: async (key, mimeType) => {
          const s3 = await getS3();
          return s3.presign(key, {
            expiresIn: 300,
            method: "PUT",
            type: mimeType,
          });
        },
      }
    );
  });

/** Takes the copy of their declaration the trustee signed in Acrobat. */
export const submitSignedDeclarationFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.uuid(), tempKey: z.string().min(1).max(500) }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "governance.sign_declaration",
        metadata: { method: "acrobat_upload" },
        target: { id: data.id, type: "conflict_declaration" },
      },
      () =>
        userFacing(async () => {
          await assertOwnDeclaration(data.id, session.user.id);
          const tempKey = assertOwnSignedUpload(data.tempKey, {
            keyPrefix: env.R2_KEY_PREFIX,
            userId: session.user.id,
          });
          const s3 = await getS3();
          const uploadedFile = s3.file(tempKey);
          if (!(await uploadedFile.exists())) {
            throw new DeclarationError(
              "The upload wasn't found. Upload it again."
            );
          }
          const documentId = await acceptSignedDeclaration({
            declarationId: data.id,
            uploaded: await readGovernanceUpload(uploadedFile),
            userId: session.user.id,
          });
          await s3.delete(tempKey).catch(() => undefined);
          return { documentId };
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
      throw new HttpError(401, "Unauthorized");
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
