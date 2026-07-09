export interface AsyncTask {
  /** Await after commit before returning the mutation response. */
  blocking?: boolean;
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
