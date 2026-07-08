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
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
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

function RecipientCommandItem({
  icon,
  label,
  onSelect,
  recipient,
  selected,
  value,
}: {
  icon: typeof UserGroupIcon;
  label: string;
  onSelect: (recipient: Recipient) => void;
  recipient: Recipient;
  selected: boolean;
  value: string;
}) {
  const handleSelect = useEventCallback(() => onSelect(recipient));

  return (
    <CommandItem onSelect={handleSelect} value={value}>
      <HugeiconsIcon className="mr-2 size-4" icon={icon} strokeWidth={2} />
      <span className="flex-1 truncate">{label}</span>
      {selected ? <span className="text-primary text-xs">Selected</span> : null}
    </CommandItem>
  );
}

function SelectedRecipientBadge({
  onRemove,
  recipient,
}: {
  onRemove: (id: string) => void;
  recipient: Recipient;
}) {
  const handleRemove = useEventCallback(() => onRemove(recipient.id));

  return (
    <Badge className="gap-1 pr-1" variant="secondary">
      <HugeiconsIcon
        className="size-3"
        icon={recipient.type === "group" ? UserGroupIcon : UserIcon}
        strokeWidth={2}
      />
      {recipient.label}
      <button
        aria-label={`Remove ${recipient.label}`}
        className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
        onClick={handleRemove}
        type="button"
      >
        <HugeiconsIcon className="size-3" icon={Cancel01Icon} strokeWidth={2} />
      </button>
    </Badge>
  );
}

export function RecipientPicker({ onChange, value }: RecipientPickerProps) {
  const [open, setOpen] = useState(false);
  const [groups] = useQuery(queries.whatsappGroup.all());
  const [users] = useQuery(queries.user.whatsappUsers());

  const whatsappUsers = users ?? [];
  const selectedIds = new Set(value.map((r) => r.id));

  const handleSelect = useEventCallback((recipient: Recipient) => {
    if (selectedIds.has(recipient.id)) {
      onChange(value.filter((r) => r.id !== recipient.id));
    } else if (value.length < MAX_RECIPIENTS) {
      onChange([...value, recipient]);
    }
  });

  const handleRemove = useEventCallback((id: string) => {
    onChange(value.filter((r) => r.id !== id));
  });

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
                  {(groups ?? []).map((group) => {
                    const recipient: Recipient = {
                      id: group.id,
                      label: group.name,
                      type: "group",
                    };
                    return (
                      <RecipientCommandItem
                        icon={UserGroupIcon}
                        key={group.id}
                        label={group.name}
                        onSelect={handleSelect}
                        recipient={recipient}
                        selected={selectedIds.has(group.id)}
                        value={`group-${group.name}`}
                      />
                    );
                  })}
                </CommandGroup>
              )}
              {whatsappUsers.length > 0 && (
                <CommandGroup heading="Users">
                  {whatsappUsers.map((user) => {
                    const recipient: Recipient = {
                      id: user.id,
                      label: user.name,
                      type: "user",
                    };
                    return (
                      <RecipientCommandItem
                        icon={UserIcon}
                        key={user.id}
                        label={user.name}
                        onSelect={handleSelect}
                        recipient={recipient}
                        selected={selectedIds.has(user.id)}
                        value={`user-${user.name}`}
                      />
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((recipient) => (
            <SelectedRecipientBadge
              key={recipient.id}
              onRemove={handleRemove}
              recipient={recipient}
            />
          ))}
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        {value.length}/{MAX_RECIPIENTS} recipients selected
      </p>
    </div>
  );
}
