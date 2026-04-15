import { Badge } from "@pi-dash/design-system/components/reui/badge";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@pi-dash/design-system/components/ui/combobox";
import { useState } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";

interface UserPickerProps {
  emptyMessage?: string;
  excludeUserIds?: ReadonlySet<string>;
  highlightedUserIds?: ReadonlySet<string>;
  highlightLabel?: string;
  onValueChange: (ids: string[]) => void;
  placeholder?: string;
  users: readonly {
    id: string;
    name: string;
    email?: null | string;
    image?: null | string;
  }[];
  value: string[];
}

export function UserPicker({
  emptyMessage = "No matching users found.",
  excludeUserIds,
  highlightedUserIds,
  highlightLabel,
  placeholder = "Search by name or email...",
  users,
  value,
  onValueChange,
}: UserPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const anchorRef = useComboboxAnchor();

  const filteredUsers = (() => {
    let list = excludeUserIds
      ? users.filter((u) => !excludeUserIds.has(u.id))
      : users;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q)
      );
    }
    if (highlightedUserIds?.size) {
      list = [...list].sort((a, b) => {
        const aH = highlightedUserIds.has(a.id) ? 0 : 1;
        const bH = highlightedUserIds.has(b.id) ? 0 : 1;
        return aH - bH;
      });
    }
    return list;
  })();

  const userMap = new Map(users.map((u) => [u.id, u]));

  return (
    <Combobox
      filter={null}
      inputValue={searchQuery}
      multiple
      onInputValueChange={setSearchQuery}
      onValueChange={onValueChange}
      value={value}
    >
      <ComboboxChips ref={anchorRef}>
        {value.map((id) => {
          const user = userMap.get(id);
          return <ComboboxChip key={id}>{user?.name ?? id}</ComboboxChip>;
        })}
        <ComboboxChipsInput placeholder={placeholder} />
      </ComboboxChips>
      <ComboboxContent anchor={anchorRef}>
        <ComboboxList>
          {filteredUsers.length === 0 ? (
            <div className="py-2 text-center text-muted-foreground text-xs">
              {emptyMessage}
            </div>
          ) : null}
          {filteredUsers.map((u) => (
            <ComboboxItem key={u.id} value={u.id}>
              <UserAvatar
                className="size-7"
                fallbackClassName="text-xs"
                user={u}
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{u.name}</span>
                  {highlightedUserIds?.has(u.id) && highlightLabel && (
                    <Badge size="xs" variant="primary-light">
                      {highlightLabel}
                    </Badge>
                  )}
                </div>
                <div className="text-muted-foreground text-xs">{u.email}</div>
              </div>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
