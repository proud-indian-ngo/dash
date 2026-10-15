import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@pi-dash/design-system/components/ui/combobox";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { log } from "evlog";
import { useEffect, useState } from "react";

import { UserAvatar } from "@/components/shared/user-avatar";
import {
  getClaimantsForPicker,
  type PickerUser,
} from "@/functions/users-for-picker";

/**
 * The people a reimbursement can be raised for or moved to. Loads only when
 * `enabled` (the viewer holds `requests.create_for_others`); the server
 * returns nothing to anyone else.
 */
export function useClaimantOptions(enabled: boolean): PickerUser[] {
  const [users, setUsers] = useState<PickerUser[]>([]);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    getClaimantsForPicker()
      .then((rows) => {
        if (!cancelled) {
          setUsers(rows);
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "getClaimantsForPicker",
          component: "ClaimantPicker",
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return users;
}

interface ClaimantComboboxProps {
  disabled?: boolean;
  id: string;
  invalid?: boolean;
  onBlur?: () => void;
  onValueChange: (userId: string) => void;
  /** Always offered, even before the list loads (for example yourself). */
  pinned?: readonly Pick<PickerUser, "email" | "id" | "image" | "name">[];
  users: readonly Pick<PickerUser, "email" | "id" | "image" | "name">[];
  value: string;
}

/** A searchable single-person picker (name or email) for the claimant. */
export function ClaimantCombobox({
  disabled = false,
  id,
  invalid = false,
  onBlur,
  onValueChange,
  pinned = [],
  users,
  value,
}: ClaimantComboboxProps) {
  const byId = new Map(
    [...pinned, ...users].map((person) => [person.id, person])
  );
  const items = [...byId.keys()];
  const itemToStringLabel = useEventCallback(
    (userId: string) => byId.get(userId)?.name ?? ""
  );
  const filter = useEventCallback((userId: string, query: string) => {
    const person = byId.get(userId);
    const q = query.trim().toLowerCase();
    if (!(person && q)) {
      return Boolean(person);
    }
    return (
      person.name.toLowerCase().includes(q) ||
      Boolean(person.email?.toLowerCase().includes(q))
    );
  });
  const handleValueChange = useEventCallback((next: string | null) => {
    if (next) {
      onValueChange(next);
    }
  });

  return (
    <Combobox
      disabled={disabled}
      filter={filter}
      items={items}
      itemToStringLabel={itemToStringLabel}
      onValueChange={handleValueChange}
      value={value}
    >
      <ComboboxInput
        aria-invalid={invalid || undefined}
        className="w-full"
        id={id}
        onBlur={onBlur}
        placeholder="Search by name or email"
      />
      <ComboboxContent>
        <ComboboxList>
          {(userId: string) => {
            const person = byId.get(userId);
            return (
              <ComboboxItem key={userId} value={userId}>
                {person ? (
                  <UserAvatar
                    className="size-6"
                    fallbackClassName="text-[10px]"
                    user={person}
                  />
                ) : null}
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{person?.name}</span>
                  {person?.email ? (
                    <span className="text-muted-foreground truncate text-xs">
                      {person.email}
                    </span>
                  ) : null}
                </div>
              </ComboboxItem>
            );
          }}
        </ComboboxList>
        <ComboboxEmpty>No matching people.</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}
