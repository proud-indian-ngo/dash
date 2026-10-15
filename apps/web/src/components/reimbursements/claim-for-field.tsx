import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@pi-dash/design-system/components/ui/field";

import type { PickerUser } from "@/functions/users-for-picker";

import { ClaimantCombobox } from "./claimant-picker";

interface ClaimForFieldProps {
  claimantId: string;
  claimants: readonly PickerUser[];
  currentUser: Pick<PickerUser, "email" | "id" | "name"> & {
    image?: null | string;
  };
  onChange: (userId: string) => void;
}

/**
 * "Claim for": finance (`requests.create_for_others`) raises the
 * reimbursement for someone else. Defaults to yourself.
 */
export function ClaimForField({
  claimantId,
  claimants,
  currentUser,
  onChange,
}: ClaimForFieldProps) {
  const isSelf = claimantId === currentUser.id;
  return (
    <Field>
      <FieldLabel htmlFor="claimantUserId">Claim for</FieldLabel>
      <ClaimantCombobox
        id="claimantUserId"
        onValueChange={onChange}
        pinned={[{ ...currentUser, image: currentUser.image ?? null }]}
        users={claimants}
        value={claimantId}
      />
      <FieldDescription>
        {isSelf
          ? "You. Pick someone else to raise this on their behalf."
          : "They own this reimbursement, see it in their requests, are notified and are paid to one of their saved bank accounts."}
      </FieldDescription>
    </Field>
  );
}
