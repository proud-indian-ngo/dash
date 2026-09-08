import type { Context } from "../context";

export interface OrientationTx {
  dbTransaction?: { wrappedTransaction: unknown };
  location?: "client" | "server";
}

/** SQL owns the role compare-and-set; effects run only after enrollment commits. */
export async function orientEnrolledKalakritiVolunteer(
  tx: OrientationTx,
  ctx: Context | undefined,
  userId: string,
  now: number
): Promise<void> {
  if (tx.location !== "server") {
    return;
  }
  const transaction = tx.dbTransaction?.wrappedTransaction;
  if (!transaction) {
    throw new Error("Server transaction is unavailable");
  }
  const { promoteKalakritiVolunteer } =
    await import("@pi-dash/db/kalakriti-orientation");
  const promoted = await promoteKalakritiVolunteer(
    transaction as Parameters<typeof promoteKalakritiVolunteer>[0],
    userId,
    now
  );
  if (!promoted) {
    return;
  }

  const meta = { mutator: "orientEnrolledKalakritiVolunteer", userId };
  ctx?.asyncTasks?.push(
    {
      meta: { ...meta, effect: "permissionCache" },
      fn: async () => {
        const { invalidatePermissionCache } =
          await import("@pi-dash/db/queries/resolve-permissions");
        invalidatePermissionCache("unoriented_volunteer");
        invalidatePermissionCache("volunteer");
      },
    },
    {
      meta: { ...meta, queueName: "notify-role-changed" },
      fn: async () => {
        const { enqueue } = await import("@pi-dash/jobs/enqueue");
        await enqueue(
          "notify-role-changed",
          { newRole: "Volunteer", userId },
          { traceId: ctx?.traceId }
        );
      },
    },
    {
      meta: { ...meta, queueName: "whatsapp-manage-orientation" },
      fn: async () => {
        const { enqueue } = await import("@pi-dash/jobs/enqueue");
        await enqueue(
          "whatsapp-manage-orientation",
          { isOriented: true, userId },
          { traceId: ctx?.traceId }
        );
      },
    }
  );
}
