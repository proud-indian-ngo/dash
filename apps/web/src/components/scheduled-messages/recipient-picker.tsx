import {
  Cancel01Icon,
  UserGroupIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@pi-dash/design-system/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@pi-dash/design-system/components/ui/popover";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useState } from "react";

export interface Recipient {
  id: string;
  label: string;
  type: "group" | "user";
}

const MAX_RECIPIENTS = 10;

interface RecipientPickerProps {
  onChange: (recipients: Recipient[]) => void;
  value: Recipient[];
}

export function RecipientPicker({ onChange, value }: RecipientPickerProps) {
  const [open, setOpen] = useState(false);
  const [groups] = useQuery(queries.whatsappGroup.all());
  const [users] = useQuery(queries.user.all());

  const whatsappUsers = (users ?? []).filter((u) => u.isOnWhatsapp);
  const selectedIds = new Set(value.map((r) => r.id));

  const handleSelect = (recipient: Recipient) => {
    if (selectedIds.has(recipient.id)) {
      onChange(value.filter((r) => r.id !== recipient.id));
    } else if (value.length < MAX_RECIPIENTS) {
      onChange([...value, recipient]);
    }
  };

  const handleRemove = (id: string) => {
    onChange(value.filter((r) => r.id !== id));
  };

  return (
    <div className="flex flex-col gap-2">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={
            <Button
              className="justify-start font-normal"
              disabled={value.length >= MAX_RECIPIENTS}
              type="button"
              variant="outline"
            >
              {value.length >= MAX_RECIPIENTS
                ? `Max ${MAX_RECIPIENTS} recipients`
                : "Add recipients..."}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-80 p-0">
          <Command>
            <CommandInput placeholder="Search groups and users..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              {(groups ?? []).length > 0 && (
                <CommandGroup heading="Groups">
                  {(groups ?? []).map((group) => (
                    <CommandItem
                      key={group.id}
                      onSelect={() =>
                        handleSelect({
                          id: group.id,
                          label: group.name,
                          type: "group",
                        })
                      }
                      value={`group-${group.name}`}
                    >
                      <HugeiconsIcon
                        className="mr-2 size-4"
                        icon={UserGroupIcon}
                        strokeWidth={2}
                      />
                      <span className="flex-1 truncate">{group.name}</span>
                      {selectedIds.has(group.id) && (
                        <span className="text-primary text-xs">Selected</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {whatsappUsers.length > 0 && (
                <CommandGroup heading="Users">
                  {whatsappUsers.map((user) => (
                    <CommandItem
                      key={user.id}
                      onSelect={() =>
                        handleSelect({
                          id: user.id,
                          label: user.name,
                          type: "user",
                        })
                      }
                      value={`user-${user.name}`}
                    >
                      <HugeiconsIcon
                        className="mr-2 size-4"
                        icon={UserIcon}
                        strokeWidth={2}
                      />
                      <span className="flex-1 truncate">{user.name}</span>
                      {selectedIds.has(user.id) && (
                        <span className="text-primary text-xs">Selected</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((recipient) => (
            <Badge
              className="gap-1 pr-1"
              key={recipient.id}
              variant="secondary"
            >
              <HugeiconsIcon
                className="size-3"
                icon={recipient.type === "group" ? UserGroupIcon : UserIcon}
                strokeWidth={2}
              />
              {recipient.label}
              <button
                aria-label={`Remove ${recipient.label}`}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                onClick={() => handleRemove(recipient.id)}
                type="button"
              >
                <HugeiconsIcon
                  className="size-3"
                  icon={Cancel01Icon}
                  strokeWidth={2}
                />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        {value.length}/{MAX_RECIPIENTS} recipients selected
      </p>
    </div>
  );
}
