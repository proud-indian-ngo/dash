import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { seriesStartDate } from "@pi-dash/shared/rrule-expand";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";

export type EditScope = "this" | "following" | "all";

const SCOPE_LABELS: Record<EditScope, string> = {
  all: "All events in the series",
  following: "This and following events",
  this: "This event only",
};

const ALL_SCOPES: EditScope[] = ["this", "following", "all"];
const FIRST_SESSION_SCOPES: EditScope[] = ["this", "all"];

/**
 * The scopes offered for a session of a series. On the series' own start
 * date "this and following" is every session, so only "All events" is
 * offered (the server treats a split there as "all" too).
 */
export function seriesEditScopes(
  seriesStart: number | undefined,
  occDate: string | null | undefined
): EditScope[] {
  return seriesStart !== undefined &&
    occDate &&
    occDate === seriesStartDate(seriesStart)
    ? FIRST_SESSION_SCOPES
    : ALL_SCOPES;
}

interface EditScopeDialogProps {
  /** Scope options shown but not selectable yet. */
  disabledScopes?: EditScope[];
  onOpenChange: (open: boolean) => void;
  onSelect: (scope: EditScope) => void;
  open: boolean;
  /** Which scope options to show. Defaults to all three. */
  scopes?: EditScope[];
  title: string;
}

function ScopeButton({
  disabled,
  onSelect,
  scope,
}: {
  disabled: boolean;
  onSelect: (scope: EditScope) => void;
  scope: EditScope;
}) {
  const handleClick = useEventCallback(() => onSelect(scope));

  return (
    <Button
      className="justify-start"
      disabled={disabled}
      onClick={handleClick}
      variant="outline"
    >
      {SCOPE_LABELS[scope]}
    </Button>
  );
}

export function EditScopeDialog({
  disabledScopes,
  onOpenChange,
  onSelect,
  open,
  scopes = ALL_SCOPES,
  title,
}: EditScopeDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-sm)">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Choose which events in the series to affect
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {scopes.map((scope) => (
            <ScopeButton
              disabled={disabledScopes?.includes(scope) ?? false}
              key={scope}
              onSelect={onSelect}
              scope={scope}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
