import type { UserRole } from "@pi-dash/db/schema/auth";

export type AsyncTask = () => Promise<void>;

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
