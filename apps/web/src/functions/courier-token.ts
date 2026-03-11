import { generateCourierJwt, syncCourierUser } from "@pi-dash/notifications";
import { withFireAndForgetLog } from "@pi-dash/observability";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/middleware/auth";

export const getCourierToken = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }

    const { id, email, name } = context.session.user;

    const token = await generateCourierJwt(id);

    withFireAndForgetLog(
      { handler: "getCourierToken", userId: id, email, name },
      () => syncCourierUser({ userId: id, email, name })
    );

    return { token };
  });
