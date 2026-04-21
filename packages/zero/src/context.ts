export interface AsyncTask {
  fn: () => Promise<void>;
  meta: { mutator: string; [key: string]: unknown };
}

export interface Context {
  _permissionSet?: Set<string>;
  asyncTasks?: AsyncTask[];
  permissions: string[];
  role: string;
  traceId?: string;
  userId: string;
}

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    context: Context;
  }
}
