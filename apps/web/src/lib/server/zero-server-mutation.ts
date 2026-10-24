import { db } from "@pi-dash/db";
import { withFireAndForgetLog } from "@pi-dash/observability";
import type { AsyncTask } from "@pi-dash/zero/context";
import { mutators } from "@pi-dash/zero/mutators";
import { schema } from "@pi-dash/zero/schema";
import { mustGetMutator, type ReadonlyJSONValue } from "@rocicorp/zero";
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";

import { buildSessionContext } from "@/lib/api-auth";
import {
  buildAuditActor,
  resolveZeroAuditSummary,
  runZeroAuditedMutation,
} from "@/lib/audit";
import { runMutationTasksSettled } from "@/lib/zero-mutate-tasks";

const dbProvider = zeroDrizzle(schema, db);

/**
 * Runs one Zero mutator on the server as `actor`, outside a client push: the
 * same checks and audit row as `/api/zero/mutate`, and its async tasks after
 * commit. Its context has no R2 or Immich helpers, so it suits mutators that
 * need none. Throws the mutator's error, whose message is meant for people.
 */
export async function runServerZeroMutation(
  actor: { user: { id: string; name: string; role: string } },
  name: string,
  args: ReadonlyJSONValue
): Promise<void> {
  const [context, auditActor] = await Promise.all([
    buildSessionContext(actor),
    buildAuditActor(actor),
  ]);
  const mutator = mustGetMutator(mutators, name);
  const asyncTasks: AsyncTask[] = [];
  await dbProvider.transaction(async (tx) => {
    const summary = await resolveZeroAuditSummary(name, args, actor.user.id);
    await runZeroAuditedMutation(
      {
        action: summary.action ?? name,
        actor: auditActor,
        metadata: summary.metadata,
        target: summary.target,
      },
      () => mutator.fn({ args, ctx: { ...context, asyncTasks }, tx }),
      (entry) => tx.mutate.auditLog.insert(entry)
    );
  });
  if (asyncTasks.length > 0) {
    withFireAndForgetLog(
      { handler: "runServerZeroMutation", mutator: name },
      () => runMutationTasksSettled(asyncTasks)
    );
  }
}
