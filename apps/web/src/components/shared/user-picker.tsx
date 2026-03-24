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
import type { User } from "@pi-dash/zero/schema";
import { useState } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";

interface UserPickerProps {
  emptyMessage?: string;
  excludeUserIds?: ReadonlySet<string>;
  onValueChange: (ids: string[]) => void;
  placeholder?: string;
  users: readonly User[];
  value: string[];
}

export function UserPicker({
  emptyMessage = "No matching users found.",
  excludeUserIds,
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
          {filteredUsers.length === 0 && searchQuery.trim() ? (
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
              <div>
                <div className="font-medium">{u.name}</div>
                <div className="text-muted-foreground text-xs">{u.email}</div>
              </div>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
