import { createServerFn } from "@tanstack/react-start";

import { authMiddleware } from "@/middleware/auth";

export const getSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context }) => {
    return context.session;
  });
