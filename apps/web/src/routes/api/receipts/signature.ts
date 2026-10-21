import { loadReceiptConfig } from "@pi-dash/db/queries/contribution-receipts";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";

import { assertServerPermission, requireSession } from "@/lib/api-auth";
import { getS3 } from "@/lib/s3";
import { safeErrorName } from "@/lib/safe-errors";

export interface ReceiptSignatureDependencies {
  assertPermission: typeof assertServerPermission;
  getSession: typeof requireSession;
  loadConfig: typeof loadReceiptConfig;
  read: (key: string) => Promise<ArrayBuffer | null>;
}

const defaults: ReceiptSignatureDependencies = {
  assertPermission: assertServerPermission,
  getSession: requireSession,
  loadConfig: loadReceiptConfig,
  read: async (key) => {
    const file = getS3().file(key);
    return (await file.exists()) ? await file.arrayBuffer() : null;
  },
};

/**
 * The signatory's signature receipts print, for the Settings preview.
 * `finance.manage` only, the people who may replace it: a signature image
 * is what a forger would want. Never cached.
 */
export async function handleReceiptSignature(
  request: Request,
  deps: ReceiptSignatureDependencies = defaults
): Promise<Response> {
  const result = await deps.getSession(request);
  if (result.error) {
    return result.error;
  }
  try {
    await deps.assertPermission(result.session, "finance.manage");
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { settings } = await deps.loadConfig();
    const image = settings ? await deps.read(settings.signatureKey) : null;
    if (!image) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return new Response(image, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": "image/png",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const log = createRequestLogger({
      method: "GET",
      path: "/api/receipts/signature",
    });
    log.set({
      errorName: safeErrorName(error),
      event: "receipt_signature_read_failed",
      userId: result.session.user.id,
    });
    log.error(new Error("Receipt signature read failed"));
    log.emit();
    return Response.json(
      { error: "The signature couldn't be loaded." },
      { status: 500 }
    );
  }
}

export const Route = createFileRoute("/api/receipts/signature")({
  server: {
    handlers: {
      GET: ({ request }) => handleReceiptSignature(request),
    },
  },
});
