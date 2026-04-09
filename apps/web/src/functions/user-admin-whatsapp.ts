interface UserAdminWhatsappSyncInput {
  currentBanned: boolean | null;
  currentIsActive: boolean;
  currentRole: string | null;
  nextIsActive?: boolean;
  nextRole?: string;
}

interface UserAdminWhatsappSyncResult {
  becameActive: boolean;
  effectiveRole: string | null;
  isOriented: boolean;
  shouldRestoreDefaultGroup: boolean;
}

export function getUserAdminWhatsappSyncPlan(
  input: UserAdminWhatsappSyncInput
): UserAdminWhatsappSyncResult {
  const effectiveRole = input.nextRole ?? input.currentRole;
  const resultingIsActive = input.nextIsActive ?? input.currentIsActive;
  const wasUnoriented = input.currentRole === "unoriented_volunteer";
  const isNowUnoriented = effectiveRole === "unoriented_volunteer";
  const roleBoundaryChanged =
    effectiveRole !== input.currentRole && wasUnoriented !== isNowUnoriented;
  const becameActive =
    input.nextIsActive === true && input.currentIsActive === false;
  const shouldRestoreDefaultGroup =
    resultingIsActive &&
    !input.currentBanned &&
    (roleBoundaryChanged || becameActive);

  return {
    becameActive,
    effectiveRole,
    isOriented: !isNowUnoriented,
    shouldRestoreDefaultGroup,
  };
}
