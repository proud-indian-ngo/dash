import type { UserRole } from "@pi-dash/db/schema/auth";

export interface AsyncTask {
  fn: () => Promise<void>;
  meta: { mutator: string; [key: string]: unknown };
}

export interface Context {
  asyncTasks?: AsyncTask[];
  role?: UserRole;
  userId: string;
}

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    context: Context;
  }
}
