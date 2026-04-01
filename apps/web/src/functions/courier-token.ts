import { enqueue } from "@pi-dash/jobs";
import { generateCourierJwt } from "@pi-dash/notifications";
import { withFireAndForgetLog } from "@pi-dash/observability";
import { createServerFn } from "@tanstack/react-start";
import { createRequestLogger } from "evlog";
import { authMiddleware } from "@/middleware/auth";

export const getCourierToken = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }

    const { id, email, name } = context.session.user;

    let token: string | null = null;
    try {
      token = await generateCourierJwt(id);
    } catch (error) {
      const log = createRequestLogger();
      log.set({ handler: "getCourierToken", userId: id, email, name });
      log.error(error instanceof Error ? error : String(error));
      log.emit();
      return { token: null };
    }

    withFireAndForgetLog(
      { handler: "getCourierToken", userId: id, email, name },
      async () => {
        await enqueue("sync-courier-user", { userId: id, email, name });
      }
    );

    return { token };
  });
