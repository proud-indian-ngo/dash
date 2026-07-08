import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
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

interface EditScopeDialogProps {
  onOpenChange: (open: boolean) => void;
  onSelect: (scope: EditScope) => void;
  open: boolean;
  /** Which scope options to show. Defaults to all three. */
  scopes?: EditScope[];
  title: string;
}

function ScopeButton({
  onSelect,
  scope,
}: {
  onSelect: (scope: EditScope) => void;
  scope: EditScope;
}) {
  const handleClick = useEventCallback(() => onSelect(scope));

  return (
    <Button className="justify-start" onClick={handleClick} variant="outline">
      {SCOPE_LABELS[scope]}
    </Button>
  );
}

export function EditScopeDialog({
  onOpenChange,
  onSelect,
  open,
  scopes = ALL_SCOPES,
  title,
}: EditScopeDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Choose which events in the series to affect
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {scopes.map((scope) => (
            <ScopeButton key={scope} onSelect={onSelect} scope={scope} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
