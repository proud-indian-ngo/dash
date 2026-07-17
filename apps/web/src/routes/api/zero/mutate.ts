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
import {
  buildAuditActor,
  resolveZeroAuditSummary,
  runZeroAuditedMutation,
} from "@/lib/audit";
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
        const { session, error: authError } = await requireSession(request);
        if (authError) {
          return authError;
        }

        const rl = checkRateLimit(`mutate:${session.user.id}`, 100);
        if (!rl.allowed) {
          return rateLimitResponse(rl);
        }

        const traceId = parseTraceparent(
          request.headers.get("traceparent")
        )?.traceId;
        const [{ permissions, role, userId }, actor] = await Promise.all([
          buildSessionContext(session),
          buildAuditActor(session),
        ]);
        const asyncTasks: AsyncTask[] = [];
        const ctx = { asyncTasks, permissions, role, traceId, userId };

        const result = await handleMutateRequest({
          dbProvider,
          handler: async (transact) =>
            await transact(async (tx, name, args) => {
              const mutator = mustGetMutator(mutators, name);
              const summary = await resolveZeroAuditSummary(name, args, userId);
              const auditOptions = {
                action: name,
                actor,
                metadata: summary.metadata,
                target: summary.target,
                traceId,
              };
              return runZeroAuditedMutation(
                auditOptions,
                () => mutator.fn({ args, ctx, tx }),
                (entry) => tx.mutate.auditLog.insert(entry)
              );
            }),
          request,
          userID: userId,
        });

        // Fire-and-forget: enqueue jobs after commit without blocking the response.
        // pg-boss handles persistence and retries from here.
        for (const [i, task] of asyncTasks.entries()) {
          withFireAndForgetLog(
            {
              ...task.meta,
              handler: "mutate",
              taskIndex: i,
              userId,
              ...(traceId ? { traceId } : {}),
            },
            () => task.fn()
          );
        }

        return Response.json(result);
      },
    },
  },
});
