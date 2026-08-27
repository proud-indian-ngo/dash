export type GuardianIdentityDecision =
  | "assign_central"
  | "create_external"
  | "reactivate_external"
  | "require_reuse_confirmation";

export interface GuardianIdentityCandidate {
  banned: boolean | null;
  canAccessKalakriti: boolean;
  emailVerified: boolean;
  hasActiveMembership: boolean;
  hasEditionMembership: boolean;
  isExternal: boolean;
  role: string;
}

export function decideGuardianIdentity({
  candidate,
  confirmReuse,
  hasPassword,
}: {
  candidate: GuardianIdentityCandidate | null;
  confirmReuse: boolean;
  hasPassword: boolean;
}): GuardianIdentityDecision {
  if (!candidate) {
    if (!hasPassword) {
      throw new Error(
        "A password of at least 10 characters is required for a new Guardian"
      );
    }
    return "create_external";
  }
  if (!candidate.emailVerified) {
    throw new Error(
      "An account with this email exists but its email is not verified"
    );
  }
  if (candidate.hasEditionMembership) {
    throw new Error("This account already has a membership in this Edition");
  }
  if (!candidate.isExternal) {
    if (candidate.role === "external_user") {
      throw new Error(
        "This Guardian account is still being provisioned; try again"
      );
    }
    if (candidate.banned) {
      throw new Error("This central account is suspended");
    }
    if (!candidate.canAccessKalakriti) {
      throw new Error("This central account cannot access Kalakriti");
    }
    return "assign_central";
  }
  if (candidate.role !== "external_user") {
    throw new Error("External identity has an invalid technical role");
  }
  if (candidate.hasActiveMembership) {
    throw new Error(
      "This Guardian already has access to an active Kalakriti Edition"
    );
  }
  return confirmReuse ? "reactivate_external" : "require_reuse_confirmation";
}

export function shouldBlockExternalIdentity({
  hasExternalMarker,
  hasOtherActiveMembership,
}: {
  hasExternalMarker: boolean;
  hasOtherActiveMembership: boolean;
}): boolean {
  return hasExternalMarker && !hasOtherActiveMembership;
}

export type GuardianContactField = "email" | "name" | "phone";

export function guardianContactChangedFields({
  current,
  next,
}: {
  current: { email: string | null; name: string; phone: string | null };
  next: { email: string; name: string; phone: string | null };
}): GuardianContactField[] {
  const fields: GuardianContactField[] = [];
  if (current.name !== next.name) {
    fields.push("name");
  }
  if ((current.email ?? "").toLowerCase() !== next.email) {
    fields.push("email");
  }
  if ((current.phone ?? "") !== (next.phone ?? "")) {
    fields.push("phone");
  }
  return fields;
}

export function assertAssignedCentralEmailUnchanged({
  emailChanged,
  isExternal,
}: {
  emailChanged: boolean;
  isExternal: boolean;
}) {
  if (!isExternal && emailChanged) {
    throw new Error(
      "Guardian login email cannot be changed for a volunteer account assigned as Guardian"
    );
  }
}
