export interface SignUpReturnedUser {
  email?: string;
  id?: string;
  name?: string;
}

function asUser(value: unknown): SignUpReturnedUser | undefined {
  if (!value || typeof value !== "object") {
    return;
  }
  const record = value as { email?: unknown; id?: unknown; name?: unknown };
  if (typeof record.id !== "string" || record.id.length === 0) {
    return;
  }
  return {
    email: typeof record.email === "string" ? record.email : undefined,
    id: record.id,
    name: typeof record.name === "string" ? record.name : undefined,
  };
}

function asPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  if ("body" in value) {
    const { body } = value as { body?: unknown };
    if (body && typeof body === "object") {
      return body;
    }
  }
  return value;
}

export function getUserFromSignUpReturned(
  returned: unknown
): SignUpReturnedUser | undefined {
  const payload = asPayload(returned);
  if (payload && typeof payload === "object" && "user" in payload) {
    const nested = asUser((payload as { user?: unknown }).user);
    if (nested) {
      return nested;
    }
  }
  return asUser(payload);
}

export async function verifyPersistedSignUpUser(
  returnedUser: SignUpReturnedUser | undefined,
  lookupByEmail: (email: string) => Promise<{ id: string } | undefined>
): Promise<SignUpReturnedUser | undefined> {
  if (!(returnedUser?.id && returnedUser.email)) {
    return;
  }
  const normalizedEmail = returnedUser.email.trim().toLowerCase();
  const persisted = await lookupByEmail(normalizedEmail);
  if (!persisted || persisted.id !== returnedUser.id) {
    return;
  }
  return returnedUser;
}
