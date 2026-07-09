import type {
  EnqueueOptions,
  JobName,
  JobPayloads,
} from "@pi-dash/jobs/enqueue";

export type EnqueueJob = <T extends JobName>(
  name: T,
  data: JobPayloads[T],
  options?: EnqueueOptions
) => Promise<string | null>;

export interface AsyncTask {
  /** Await after commit before returning the mutation response. */
  blocking?: boolean;
  fn: () => Promise<void>;
  meta: { mutator: string; [key: string]: unknown };
}

export interface MoveR2ObjectInput {
  mimeType?: string;
  sourceKey: string;
  targetKey: string;
}

export interface MarkScheduledMessageRecipientFailedInput {
  error: string;
  recipientRowId: string;
}

export interface Context {
  _permissionSet?: Set<string>;
  asyncTasks?: AsyncTask[];
  enqueue?: EnqueueJob;
  markScheduledMessageRecipientFailed?: (
    data: MarkScheduledMessageRecipientFailedInput
  ) => Promise<void>;
  moveR2Object?: (data: MoveR2ObjectInput) => Promise<void>;
  permissions: string[];
  photoNotificationDelaySeconds?: number;
  r2KeyPrefix?: string;
  role: string;
  traceId?: string;
  userId: string;
}

export function requireEnqueue(ctx: Pick<Context, "enqueue">): EnqueueJob {
  if (!ctx.enqueue) {
    throw new Error("Job enqueue handler is required");
  }
  return ctx.enqueue;
}

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    context: Context;
  }
}
