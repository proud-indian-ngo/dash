import { auth } from "@pi-dash/auth";
import { createMiddleware } from "@tanstack/react-start";
import { log } from "evlog";

export const authMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
    try {
      session = await auth.api.getSession({ headers: request.headers });
    } catch (error) {
      log.error({
        component: "authMiddleware",
        action: "getSession",
        error: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : undefined,
        hasCookie: request.headers.has("cookie"),
      });
    }
    return next({
      context: {
        headers: request.headers,
        session,
      },
    });
  }
);
