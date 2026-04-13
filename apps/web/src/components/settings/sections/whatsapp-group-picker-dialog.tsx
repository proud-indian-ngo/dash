import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Checkbox } from "@pi-dash/design-system/components/ui/checkbox";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { ScrollArea } from "@pi-dash/design-system/components/ui/scroll-area";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { log } from "evlog";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { fetchWhatsAppGroups } from "@/functions/whatsapp-groups";

interface WapiGroup {
  jid: string;
  name: string;
  participantCount: number;
}

interface WhatsAppGroupPickerDialogProps {
  existingJids: Set<string>;
  onAdd: (groups: { jid: string; name: string }[]) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function DialogBody({
  error,
  filtered,
  groups,
  loading,
  onSearchChange,
  search,
  selected,
  totalFetched,
  toggleGroup,
}: {
  error: string | null;
  filtered: WapiGroup[];
  groups: WapiGroup[];
  loading: boolean;
  onSearchChange: (value: string) => void;
  search: string;
  selected: Set<string>;
  totalFetched: number;
  toggleGroup: (jid: string) => void;
}) {
  if (error) {
    return <p className="py-4 text-center text-destructive text-sm">{error}</p>;
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2 py-4">
        {["s1", "s2", "s3", "s4", "s5"].map((id) => (
          <Skeleton className="h-10 w-full" key={id} />
        ))}
      </div>
    );
  }

  if (totalFetched === 0) {
    return (
      <p className="py-4 text-center text-muted-foreground text-sm">
        No WhatsApp groups found. The connected account may not be part of any
        groups.
      </p>
    );
  }

  if (groups.length === 0) {
    return (
      <p className="py-4 text-center text-muted-foreground text-sm">
        All WhatsApp groups have already been added.
      </p>
    );
  }

  return (
    <>
      <div className="relative">
        <HugeiconsIcon
          className="absolute top-2.5 left-2.5 size-4 text-muted-foreground"
          icon={Search01Icon}
          strokeWidth={2}
        />
        <Input
          className="pl-8"
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search groups..."
          value={search}
        />
      </div>
      <ScrollArea className="max-h-72">
        <div className="flex flex-col gap-1">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground text-sm">
              No groups match your search.
            </p>
          ) : (
            filtered.map((group) => (
              <button
                className="flex w-full cursor-pointer items-start gap-3 rounded-md p-2 text-left hover:bg-accent"
                key={group.jid}
                onClick={() => toggleGroup(group.jid)}
                type="button"
              >
                <Checkbox
                  checked={selected.has(group.jid)}
                  className="mt-0.5"
                  onCheckedChange={() => toggleGroup(group.jid)}
                  tabIndex={-1}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="whitespace-normal break-words font-medium text-sm leading-snug">
                    {group.name}
                  </span>
                  <span className="truncate text-muted-foreground text-xs">
                    {group.jid}
                  </span>
                </div>
                <Badge className="shrink-0 self-start" variant="secondary">
                  {group.participantCount}
                </Badge>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </>
  );
}

function addButtonLabel(count: number): string {
  return count > 0 ? `Add selected (${count})` : "Add selected";
}

export function WhatsAppGroupPickerDialog({
  existingJids,
  onAdd,
  onOpenChange,
  open,
}: WhatsAppGroupPickerDialogProps) {
  const [allGroups, setAllGroups] = useState<WapiGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelected(new Set());
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchWhatsAppGroups()
      .then((result) => {
        if (cancelled) {
          return;
        }
        const withJid = result.groups.filter((g) => g.jid);
        setAllGroups(withJid);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        log.error({
          component: "WhatsAppGroupPickerDialog",
          action: "fetchGroups",
          error: error instanceof Error ? error.message : String(error),
        });
        setError(
          "Failed to fetch WhatsApp groups. Check that the WhatsApp gateway is running."
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const availableGroups = allGroups.filter((g) => !existingJids.has(g.jid));

  const filtered = search
    ? availableGroups.filter((g) =>
        g.name.toLowerCase().includes(search.toLowerCase())
      )
    : availableGroups;

  const toggleGroup = (jid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(jid)) {
        next.delete(jid);
      } else {
        next.add(jid);
      }
      return next;
    });
  };

  const handleAdd = async () => {
    const selectedGroups = availableGroups
      .filter((g) => selected.has(g.jid))
      .map((g) => ({ jid: g.jid, name: g.name }));
    setSubmitting(true);
    try {
      await onAdd(selectedGroups);
    } finally {
      setSubmitting(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add WhatsApp Groups</DialogTitle>
          <DialogDescription className="sr-only">
            Select WhatsApp groups to add to pi-dash
          </DialogDescription>
        </DialogHeader>

        <DialogBody
          error={error}
          filtered={filtered}
          groups={availableGroups}
          loading={loading}
          onSearchChange={setSearch}
          search={search}
          selected={selected}
          toggleGroup={toggleGroup}
          totalFetched={allGroups.length}
        />

        <DialogFooter>
          <Button
            disabled={submitting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={selected.size === 0 || submitting}
            onClick={handleAdd}
            type="button"
          >
            {submitting ? "Adding..." : addButtonLabel(selected.size)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
