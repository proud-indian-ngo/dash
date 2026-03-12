import { db } from "@pi-dash/db";
import { withTaskLog } from "@pi-dash/observability";
import { mutators } from "@pi-dash/zero/mutators";
import { schema } from "@pi-dash/zero/schema";
import { mustGetMutator } from "@rocicorp/zero";
import { handleMutateRequest } from "@rocicorp/zero/server";
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";
import { createFileRoute } from "@tanstack/react-router";
import { buildSessionContext, requireSession } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const dbProvider = zeroDrizzle(schema, db);

// Register the database provider for type safety
declare module "@rocicorp/zero" {
  interface DefaultTypes {
    dbProvider: typeof dbProvider;
  }
}

export const Route = createFileRoute("/api/zero/mutate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { session, error } = await requireSession(request);
        if (error) {
          return error;
        }

        const rl = checkRateLimit(`mutate:${session.user.id}`, 100);
        if (!rl.allowed) {
          return rateLimitResponse(rl);
        }

        const { role, userId } = buildSessionContext(session);
        const asyncTasks: Array<() => Promise<void>> = [];
        const ctx = { asyncTasks, role, userId };

        const result = await handleMutateRequest(
          dbProvider,
          async (transact) => {
            return await transact(async (tx, name, args) => {
              const mutator = mustGetMutator(mutators, name);
              return await mutator.fn({ tx, ctx, args });
            });
          },
          request
        );

        // Run async tasks (e.g. WhatsApp group ops) AFTER successful commit — retried via withTaskLog
        await Promise.allSettled(
          asyncTasks.map((task, i) =>
            withTaskLog(
              { handler: "mutate", userId, step: "async-task", taskIndex: i },
              () => task()
            )
          )
        );

        return Response.json(result);
      },
    },
  },
});
