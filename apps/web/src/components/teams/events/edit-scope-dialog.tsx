import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";

export type EditScope = "this" | "following" | "all";

const SCOPE_LABELS: Record<EditScope, string> = {
  this: "This event only",
  following: "This and following events",
  all: "All events in the series",
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
            <Button
              className="justify-start"
              key={scope}
              onClick={() => onSelect(scope)}
              variant="outline"
            >
              {SCOPE_LABELS[scope]}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
