import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { auth } from "@pi-dash/auth";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { HttpError } from "@/lib/http-error";
import { authMiddleware } from "@/middleware/auth";

/**
 * What an assistant asks for when someone connects their account: Better
 * Auth sends the signed authorize query to the consent page, and it is
 * verified here before anything is shown (assistants.md).
 */
export const getConsentRequest = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ query: z.string() }))
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new HttpError(401, "Unauthorized");
    }
    const { secret } = await auth.$context;
    if (!(await verifyOAuthQueryParams(data.query, secret))) {
      throw new HttpError(
        400,
        "This link has expired. Start connecting again from the assistant."
      );
    }
    const params = new URLSearchParams(data.query);
    const clientId = params.get("client_id") ?? "";
    const client = await auth.api.getOAuthClientPublic({
      headers: context.headers,
      query: { client_id: clientId },
    });
    const redirectUri = params.get("redirect_uri");
    return {
      clientName: client.client_name || "An assistant",
      redirectHost: redirectUri ? new URL(redirectUri).host : null,
      scopes: (params.get("scope") ?? "").split(" ").filter(Boolean),
    };
  });
