import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { createRequestLogger } from "evlog";
import * as z from "zod";

import { trustedClientIp } from "@/lib/client-ip";
import { isServerFnRequest } from "@/lib/server/error-tracking";
import {
  type ReceiptVerification,
  verifyReceiptLink,
} from "@/lib/server/receipt-verification";

export const receiptVerificationSearchSchema = z.object({
  s: z.string().catch(""),
});

const PAGE_STATUS = { invalid: 404, limited: 429 } as const;

/**
 * For the public `/verify/r` page, with no session: the signed link is the
 * authority. A scan renders on the server, so the page answers 404 or 429;
 * a client-side call keeps 200 so it still gets its result.
 */
export const getReceiptVerification = createServerFn({ method: "GET" })
  .validator(z.object({ receiptId: z.string(), sig: z.string() }))
  .handler(async ({ data }): Promise<ReceiptVerification> => {
    const ip = trustedClientIp(getRequest()) ?? "unknown";
    const result = await verifyReceiptLink({ ...data, ip });
    if (result.status === "limited") {
      const log = createRequestLogger({ method: "GET", path: "/verify/r" });
      log.warn("receipt_verify_rate_limited");
      log.emit();
    }
    if (
      (result.status === "invalid" || result.status === "limited") &&
      !isServerFnRequest()
    ) {
      setResponseStatus(PAGE_STATUS[result.status]);
    }
    return result;
  });
