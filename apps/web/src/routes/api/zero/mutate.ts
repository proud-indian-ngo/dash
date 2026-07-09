import { db } from "@pi-dash/db";
import { withFireAndForgetLog } from "@pi-dash/observability";
import { parseTraceparent } from "@pi-dash/observability/trace-context";
import type { AsyncTask } from "@pi-dash/zero/context";
import { mutators } from "@pi-dash/zero/mutators";
import { schema } from "@pi-dash/zero/schema";
import { mustGetMutator } from "@rocicorp/zero";
import { handleMutateRequest } from "@rocicorp/zero/server";
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";
import { createFileRoute } from "@tanstack/react-router";
import { buildSessionContext, requireSession } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  runMutationAsyncTasksInOrder,
  shouldDrainMutationAsyncTasks,
} from "@/lib/zero-mutate-tasks";

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

        const traceId = parseTraceparent(
          request.headers.get("traceparent")
        )?.traceId;
        const { permissions, role, userId } =
          await buildSessionContext(session);
        const asyncTasks: AsyncTask[] = [];
        const baseCtx = { permissions, role, traceId, userId };

        const result = await handleMutateRequest({
          dbProvider,
          handler: async (transact) => {
            const mutationAsyncTasks: AsyncTask[] = [];
            const mutationResult = await transact(async (tx, name, args) => {
              const mutator = mustGetMutator(mutators, name);
              const ctx = {
                ...baseCtx,
                asyncTasks: mutationAsyncTasks,
              };
              return await mutator.fn({ args, ctx, tx });
            });
            if (shouldDrainMutationAsyncTasks(mutationResult)) {
              asyncTasks.push(...mutationAsyncTasks);
            }
            return mutationResult;
          },
          request,
          userID: userId,
        });

        // Fire-and-forget after commit without blocking the response.
        // Tasks run in order because later enqueues can depend on earlier R2 moves.
        if (asyncTasks.length > 0) {
          withFireAndForgetLog(
            {
              handler: "mutate",
              mutators: asyncTasks.map((task) => task.meta.mutator),
              taskCount: asyncTasks.length,
              userId,
              ...(traceId ? { traceId } : {}),
            },
            () => runMutationAsyncTasksInOrder(asyncTasks)
          );
        }

        return Response.json(result);
      },
    },
  },
});
