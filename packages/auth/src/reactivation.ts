export interface SignInReactivationContext {
  banned: boolean | null;
  isActive: boolean;
  role: string | null;
}

export interface SignInReactivationDeps {
  fetchUserState: (
    userId: string
  ) => Promise<SignInReactivationContext | undefined>;
  markUserActive: (userId: string) => Promise<boolean>;
  restoreDefaultGroup: (params: {
    isOriented: boolean;
    userId: string;
  }) => Promise<void> | void;
}

export type SignInReactivationResult =
  | { status: "already-active" }
  | { status: "missing-user" }
  | { status: "reactivated"; role: string | null }
  | { status: "skipped-banned" }
  | { status: "update-skipped"; role: string | null };

export function isOrientedRole(role: string | null | undefined): boolean {
  return role !== "unoriented_volunteer";
}

export function getUserIdFromNewSession(newSession: unknown): string | null {
  if (!newSession || typeof newSession !== "object") {
    return null;
  }

  const sessionUserId =
    "session" in newSession
      ? (newSession as { session?: { userId?: unknown } }).session?.userId
      : undefined;
  if (typeof sessionUserId === "string" && sessionUserId.length > 0) {
    return sessionUserId;
  }

  const userId =
    "user" in newSession
      ? (newSession as { user?: { id?: unknown } }).user?.id
      : undefined;
  if (typeof userId === "string" && userId.length > 0) {
    return userId;
  }

  return null;
}

export async function reactivateUserAfterSignIn(
  userId: string,
  deps: SignInReactivationDeps
): Promise<SignInReactivationResult> {
  const existingUser = await deps.fetchUserState(userId);

  if (!existingUser) {
    return { status: "missing-user" };
  }

  if (existingUser.banned) {
    return { status: "skipped-banned" };
  }

  if (existingUser.isActive) {
    return { status: "already-active" };
  }

  const updated = await deps.markUserActive(userId);
  if (!updated) {
    return { role: existingUser.role, status: "update-skipped" };
  }

  await deps.restoreDefaultGroup({
    isOriented: isOrientedRole(existingUser.role),
    userId,
  });

  return { role: existingUser.role, status: "reactivated" };
}
