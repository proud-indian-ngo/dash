import type { Context } from "../context";

export interface OrientationTx {
  dbTransaction?: { wrappedTransaction: unknown };
  location?: "client" | "server";
}

type Promotion = "promoteEventAttendee" | "promoteKalakritiVolunteer";

/** SQL owns the role compare-and-set; effects run only after the caller commits. */
async function orientVolunteer(
  tx: OrientationTx,
  ctx: Context | undefined,
  userId: string,
  now: number,
  promotion: Promotion,
  mutator: string
): Promise<void> {
  if (tx.location !== "server") {
    return;
  }
  const transaction = tx.dbTransaction?.wrappedTransaction;
  if (!transaction) {
    throw new Error("Server transaction is unavailable");
  }
  const promote = (await import("@pi-dash/db/kalakriti-orientation"))[
    promotion
  ];
  const promoted = await promote(
    transaction as Parameters<typeof promote>[0],
    userId,
    now
  );
  if (!promoted) {
    return;
  }

  const meta = { mutator, userId };
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
          { changedAt: now, newRole: "Volunteer", userId },
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

export function orientEnrolledKalakritiVolunteer(
  tx: OrientationTx,
  ctx: Context | undefined,
  userId: string,
  now: number
): Promise<void> {
  return orientVolunteer(
    tx,
    ctx,
    userId,
    now,
    "promoteKalakritiVolunteer",
    "orientEnrolledKalakritiVolunteer"
  );
}

/** Attending an event orients an unoriented volunteer. */
export function orientEventAttendee(
  tx: OrientationTx,
  ctx: Context | undefined,
  userId: string,
  now: number
): Promise<void> {
  return orientVolunteer(
    tx,
    ctx,
    userId,
    now,
    "promoteEventAttendee",
    "orientEventAttendee"
  );
}
