import { db } from "@pi-dash/db";
import { env } from "@pi-dash/env/server";
import { enqueue } from "@pi-dash/jobs/enqueue";
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
import { copyR2Object } from "@/lib/r2-upload-claim";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  isSuccessfulMutationResult,
  runMutationTasksInOrder,
  runMutationTasksSettled,
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
        const baseContext = {
          copyR2Object,
          enqueue,
          permissions,
          r2KeyPrefix: env.R2_KEY_PREFIX,
          role,
          traceId,
          userId,
        };

        const result = await handleMutateRequest({
          dbProvider,
          handler: async (transact) => {
            const beforeCommitTasks: AsyncTask[] = [];
            const mutationAsyncTasks: AsyncTask[] = [];
            const mutationResult = await transact(async (tx, name, args) => {
              const mutator = mustGetMutator(mutators, name);
              const ctx = {
                ...baseContext,
                asyncTasks: mutationAsyncTasks,
                beforeCommitTasks,
              };
              await mutator.fn({ args, ctx, tx });
              await runMutationTasksInOrder(beforeCommitTasks);
            });
            if (isSuccessfulMutationResult(mutationResult)) {
              asyncTasks.push(...mutationAsyncTasks);
            }
            return mutationResult;
          },
          request,
          userID: userId,
        });

        if (asyncTasks.length > 0) {
          withFireAndForgetLog(
            {
              handler: "mutate",
              mutators: asyncTasks.map((task) => task.meta.mutator),
              taskCount: asyncTasks.length,
              userId,
              ...(traceId ? { traceId } : {}),
            },
            () => runMutationTasksSettled(asyncTasks)
          );
        }

        return Response.json(result);
      },
    },
  },
});
