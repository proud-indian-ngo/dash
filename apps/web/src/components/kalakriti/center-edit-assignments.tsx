import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { log } from "evlog";
import { useEffect, useState } from "react";

import { Loader } from "@/components/loader";
import {
  getKalakritiVolunteersForPicker,
  type PickerUser,
} from "@/functions/users-for-picker";

import { CenterAssignments } from "./center-assignments";

export function CenterEditAssignments({
  centerId,
  editionId,
  canManageGuardians,
  canManageLiaisons,
  retired,
  archived,
}: {
  centerId: string;
  editionId: string;
  canManageGuardians: boolean;
  canManageLiaisons: boolean;
  retired: boolean;
  archived: boolean;
}) {
  const loadGuardians = canManageGuardians && !archived && !retired;
  const [guardians, guardianResult] = useQuery(
    queries.kalakritiGuardian.roster({ editionId }),
    { enabled: loadGuardians }
  );
  const [guardianLinks, guardianLinksResult] = useQuery(
    queries.kalakritiCenter.guardianAssignments({ editionId }),
    { enabled: canManageGuardians }
  );
  const [liaisonLinks, liaisonLinksResult] = useQuery(
    queries.kalakritiCenter.liaisonAssignments({ editionId }),
    { enabled: canManageLiaisons }
  );
  const [volunteers, setVolunteers] = useState<PickerUser[]>([]);
  const [volunteerState, setVolunteerState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [retry, setRetry] = useState(0);
  const loadVolunteers = canManageLiaisons && !archived && !retired;
  useEffect(() => {
    if (!loadVolunteers) return;
    let active = true;
    setVolunteerState("loading");
    getKalakritiVolunteersForPicker({ data: { editionId } })
      .then((users) => {
        if (!active) return;
        setVolunteers(users);
        setVolunteerState("ready");
      })
      .catch((error) => {
        log.error({
          component: "CenterEditAssignments",
          action: "loadVolunteers",
          editionId,
          centerId,
          error: error instanceof Error ? error.message : String(error),
        });
        if (active) setVolunteerState("error");
      });
    return () => {
      active = false;
    };
  }, [editionId, centerId, loadVolunteers, retry]);
  const guardianAssignments = guardianLinks
    .filter((link) => link.centerId === centerId)
    .map((link) => ({
      centerId,
      id: link.id,
      membershipId: link.membershipId,
      name: link.membership?.snapshotName ?? "Unknown Guardian",
    }));
  const liaisonAssignments = liaisonLinks
    .filter((link) => link.centerId === centerId)
    .map((link) => ({
      centerId,
      id: link.id,
      membershipId: link.membershipId,
      name: link.membership?.snapshotName ?? "Unknown Liaison",
      responsibility: link.responsibility,
    }));
  const assignedGuardianIds = new Set(
    guardianAssignments.map((link) => link.membershipId)
  );
  const guardianOptions = guardians
    .filter(
      (guardian) =>
        guardian.state === "active" && !assignedGuardianIds.has(guardian.id)
    )
    .map((guardian) => ({ id: guardian.id, name: guardian.snapshotName }));
  const loading =
    (loadGuardians &&
      guardians.length === 0 &&
      guardianResult.type !== "complete") ||
    (canManageGuardians &&
      guardianLinks.length === 0 &&
      guardianLinksResult.type !== "complete") ||
    (canManageLiaisons &&
      liaisonLinks.length === 0 &&
      liaisonLinksResult.type !== "complete") ||
    (loadVolunteers && volunteerState === "loading");
  if (loading)
    return (
      <div role="status" aria-label="Loading Center assignments">
        <Loader />
      </div>
    );
  return (
    <CenterAssignments
      readOnly={archived}
      allowNewAssignments={!retired}
      canManageGuardians={canManageGuardians}
      canManageLiaisons={canManageLiaisons}
      centerId={centerId}
      editionId={editionId}
      guardianAssignments={guardianAssignments}
      guardianOptions={guardianOptions}
      liaisonAssignments={liaisonAssignments}
      volunteerOptions={volunteers}
      volunteerOptionsError={volunteerState === "error"}
      onRetryVolunteers={() => setRetry((value) => value + 1)}
    />
  );
}
