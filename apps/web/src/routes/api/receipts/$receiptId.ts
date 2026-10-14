import { renderReceiptPdf } from "@pi-dash/jobs/lib/receipt-pdf";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";
import { z } from "zod";

import { assertServerPermission, requireSession } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { safeErrorName } from "@/lib/safe-errors";

export interface ReceiptPdfDependencies {
  assertPermission: typeof assertServerPermission;
  audit: typeof runSessionAuditedAction;
  getSession: typeof requireSession;
  render: typeof renderReceiptPdf;
}

const defaults: ReceiptPdfDependencies = {
  assertPermission: assertServerPermission,
  audit: runSessionAuditedAction,
  getSession: requireSession,
  render: renderReceiptPdf,
};

/**
 * A receipt's PDF, rendered on demand from its frozen snapshot (nothing is
 * stored). `donors.receipt` only, because the PDF carries the donor's full
 * ID number; each download is audited as `contribution_receipt.download`
 * with the receipt ID, as revealing an identifier is. Voided receipts still
 * download, marked void.
 */
export async function handleReceiptPdf(
  request: Request,
  receiptIdParam: string,
  deps: ReceiptPdfDependencies = defaults
): Promise<Response> {
  const receiptId = z.uuid().safeParse(receiptIdParam);
  if (!receiptId.success) {
    return Response.json({ error: "Invalid receipt" }, { status: 400 });
  }
  const result = await deps.getSession(request);
  if (result.error) {
    return result.error;
  }
  const { session } = result;
  try {
    await deps.assertPermission(session, "donors.receipt");
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const rendered = await deps.audit(
      session,
      request.headers,
      {
        action: "contribution_receipt.download",
        target: { id: receiptId.data, type: "contribution_receipt" },
      },
      () => deps.render(receiptId.data)
    );
    if (!rendered) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return new Response(new Uint8Array(rendered.pdf), {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${rendered.filename}"`,
        "Content-Type": "application/pdf",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    // Never log the message: rendering errors can quote donor details.
    const log = createRequestLogger({
      method: "GET",
      path: "/api/receipts/$receiptId",
    });
    log.set({
      errorName: safeErrorName(error),
      event: "receipt_pdf_failed",
      receiptId: receiptId.data,
      userId: session.user.id,
    });
    log.error(new Error("Receipt PDF failed"));
    log.emit();
    return Response.json(
      { error: "The receipt couldn't be generated." },
      { status: 500 }
    );
  }
}

export const Route = createFileRoute("/api/receipts/$receiptId")({
  server: {
    handlers: {
      GET: ({ request, params }) => handleReceiptPdf(request, params.receiptId),
    },
  },
});
