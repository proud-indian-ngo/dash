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
  byteSize?: number;
  /**
   * Checks the bytes before the copy: `payeeSignature` takes only a PNG the
   * signature pad could have drawn (size, dimensions and format).
   */
  contentCheck?: "payeeSignature";
  mimeType?: string;
  sourceKey: string;
  targetKey: string;
}

export interface ImmichUploadReceiptClaim {
  assetId: string;
  eventId: string;
  mimeType: string;
  photoId: string;
  userId: string;
}

export interface MutationPrivateUser {
  banned: boolean | null;
  email: string;
  isActive: boolean;
  name: string;
  phone: string | null;
  role: string;
}

export interface Context {
  _permissionSet?: Set<string>;
  asyncTasks?: AsyncTask[];
  beforeCommitTasks?: AsyncTask[];
  copyR2Object?: (input: CopyR2ObjectInput) => Promise<void>;
  enqueue?: EnqueueJob;
  lockR2Object?: (r2Key: string) => Promise<void>;
  lockR2ObjectForClaim?: (r2Key: string) => Promise<void>;
  loadPrivateUser?: (id: string) => Promise<MutationPrivateUser | null>;
  permissions: string[];
  r2KeyPrefix?: string;
  role: string;
  rollbackTasks?: AsyncTask[];
  traceId?: string;
  userId: string;
  verifyImmichUploadReceipt?: (
    input: ImmichUploadReceiptClaim & { receipt: string }
  ) => boolean;
}

export function requirePrivateUserLoader(
  ctx: Pick<Context, "loadPrivateUser">
): NonNullable<Context["loadPrivateUser"]> {
  if (!ctx.loadPrivateUser) {
    throw new Error("Private user loader is required");
  }
  return ctx.loadPrivateUser;
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
