import { auth } from "@pi-dash/auth";
import { createMiddleware } from "@tanstack/react-start";

export const authMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    return next({
      context: {
        headers: request.headers,
        session,
      },
    });
  }
);
