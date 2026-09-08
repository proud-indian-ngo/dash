import { formatKalakritiVolunteerHumanId } from "@pi-dash/shared/kalakriti";

import {
  getEditionForUpdate,
  type LockableKalakritiTx,
  type LockedRegistrationEdition,
} from "./mutators/kalakriti-row-locks";
import { zql } from "./schema";

abstract class BivariantZeroMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}

type ZeroMutationFn = BivariantZeroMutation["bivarianceHack"];

export interface VolunteerIdTx extends LockableKalakritiTx {
  mutate: {
    kalakritiEdition: { update: ZeroMutationFn };
    kalakritiEditionMembership: { update: ZeroMutationFn };
  };
}

async function resolveVolunteerHumanId(
  tx: VolunteerIdTx,
  edition: Pick<
    LockedRegistrationEdition,
    "id" | "year" | "nextVolunteerSequence"
  >,
  membershipId: string
): Promise<string> {
  const membership = (await tx.run(
    zql.kalakritiEditionMembership.where("id", membershipId).one()
  )) as
    | {
        editionId: string;
        humanId: string | null;
        kind: "guardian" | "volunteer";
        state: "active" | "archived";
      }
    | undefined;
  if (!membership || membership.editionId !== edition.id) {
    throw new Error("Membership not found in this Edition");
  }
  if (membership.kind !== "volunteer") {
    throw new Error("Membership is not a Volunteer");
  }
  if (membership.state !== "active") {
    throw new Error("Archived Volunteers cannot receive yearly IDs");
  }
  if (membership.humanId) {
    return membership.humanId;
  }
  const humanId = formatKalakritiVolunteerHumanId(
    edition.year,
    edition.nextVolunteerSequence
  );
  await tx.mutate.kalakritiEditionMembership.update({
    humanId,
    id: membershipId,
  });
  await tx.mutate.kalakritiEdition.update({
    id: edition.id,
    nextVolunteerSequence: edition.nextVolunteerSequence + 1,
  });
  return humanId;
}

export async function ensureVolunteerHumanId(
  tx: VolunteerIdTx,
  args: {
    editionId: string;
    membershipId: string;
  }
): Promise<string> {
  const edition = await getEditionForUpdate(tx, args.editionId);
  if (!edition?.year || edition.nextVolunteerSequence === undefined) {
    throw new Error("Edition registration data is incomplete");
  }
  if (edition.lifecycle === "archived") {
    throw new Error("Edition is archived");
  }
  return resolveVolunteerHumanId(
    tx,
    {
      id: edition.id,
      year: edition.year,
      nextVolunteerSequence: edition.nextVolunteerSequence,
    },
    args.membershipId
  );
}
