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
