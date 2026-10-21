import { loadReceiptConfig } from "@pi-dash/db/queries/contribution-receipts";
import { createFileRoute } from "@tanstack/react-router";

import { assertServerPermission, requireSession } from "@/lib/api-auth";
import { getS3 } from "@/lib/s3";

/**
 * The signatory's signature receipts print, for the Settings preview.
 * `finance.manage` only, the people who may replace it: a signature image
 * is what a forger would want. Never cached.
 */
export async function handleReceiptSignature(
  request: Request
): Promise<Response> {
  const result = await requireSession(request);
  if (result.error) {
    return result.error;
  }
  try {
    await assertServerPermission(result.session, "finance.manage");
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { settings } = await loadReceiptConfig();
  const file = settings ? getS3().file(settings.signatureKey) : null;
  if (!(file && (await file.exists()))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return new Response(await file.arrayBuffer(), {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const Route = createFileRoute("/api/receipts/signature")({
  server: {
    handlers: {
      GET: ({ request }) => handleReceiptSignature(request),
    },
  },
});
