import type {
  EnqueueOptions,
  JobName,
  JobPayloads,
} from "@pi-dash/jobs/enqueue";

export type EnqueueJob = <T extends JobName>(
  name: T,
  data: JobPayloads[T],
  options?: EnqueueOptions
) => Promise<null | string>;

export interface AsyncTask {
  fn: () => Promise<void>;
  meta: { mutator: string; [key: string]: unknown };
}

export interface CopyR2ObjectInput {
  mimeType?: string;
  sourceKey: string;
  targetKey: string;
}

export interface Context {
  _permissionSet?: Set<string>;
  asyncTasks?: AsyncTask[];
  beforeCommitTasks?: AsyncTask[];
  copyR2Object?: (input: CopyR2ObjectInput) => Promise<void>;
  enqueue?: EnqueueJob;
  permissions: string[];
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
