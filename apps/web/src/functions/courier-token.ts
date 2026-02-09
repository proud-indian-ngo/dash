import { generateCourierJwt, syncCourierUser } from "@pi-dash/notifications";
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

    syncCourierUser({ userId: id, email, name }).catch(console.error);

    return { token };
  });
