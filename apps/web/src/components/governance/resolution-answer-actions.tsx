import { Button } from "@pi-dash/design-system/components/ui/button";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { OBJECTION_REASON_MAX } from "@pi-dash/shared/resolutions";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import {
  declareResolutionConflictFn,
  objectToResolutionFn,
} from "@/functions/resolutions";

import { useVoteReauth } from "./use-vote-reauth";

type Kind = "objection" | "conflict";

const COPY: Record<
  Kind,
  { action: string; description: string; label: string; title: string }
> = {
  conflict: {
    action: "Declare conflict",
    description:
      "You have a personal interest in this decision (clause 5.3). You're left out of its count, and your signature on the circular won't assent to it.",
    label: "What is the interest?",
    title: "Declare a conflict of interest",
  },
  objection: {
    action: "Record objection",
    description:
      "An objection is recorded with your reason and shown to the Board. Your signature on the circular won't assent to this resolution, and its answers will say you objected.",
    label: "Reason",
    title: "Object to this resolution",
  },
};

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Objecting to one resolution of a circular, or declaring a conflict on it. */
export function ResolutionAnswerActions({
  position,
  resolutionId,
}: {
  position: number;
  resolutionId: string;
}) {
  const { dialog: reauthDialog, runVote } = useVoteReauth();
  const object = useServerFn(objectToResolutionFn);
  const conflict = useServerFn(declareResolutionConflictFn);
  const [kind, setKind] = useState<Kind | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const start = (next: Kind) => {
    setText("");
    setKind(next);
  };

  const handleSend = useEventCallback(async () => {
    if (!(kind && text.trim())) {
      return;
    }
    setSending(true);
    await runVote(() =>
      kind === "objection"
        ? object({ data: { id: resolutionId, reason: text } })
        : conflict({ data: { id: resolutionId, note: text } })
    )
      .then((result) => {
        if (result) {
          toast.success(
            kind === "objection" ? "Objection recorded" : "Conflict declared"
          );
          setKind(null);
        }
      })
      .catch((error: unknown) => {
        toast.error("That wasn't recorded", {
          description: errorText(error, "Something went wrong"),
        });
      })
      .finally(() => setSending(false));
  });

  const fieldId = `answer-text-${resolutionId}`;
  return (
    <>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <button
          aria-label={`Object to resolution ${position}`}
          className="hover:text-foreground underline-offset-4 hover:underline"
          onClick={() => start("objection")}
          type="button"
        >
          Object
        </button>
        <button
          aria-label={`Declare a conflict of interest on resolution ${position}`}
          className="hover:text-foreground underline-offset-4 hover:underline"
          onClick={() => start("conflict")}
          type="button"
        >
          Declare a conflict of interest
        </button>
      </div>
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setKind(null);
          }
        }}
        open={kind !== null}
      >
        <DialogContent className="sm:max-w-(--dialog-md)">
          <DialogHeader>
            <DialogTitle>{kind ? COPY[kind].title : ""}</DialogTitle>
            <DialogDescription>
              {kind ? COPY[kind].description : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldId}>{kind ? COPY[kind].label : ""}</Label>
            <Textarea
              id={fieldId}
              maxLength={OBJECTION_REASON_MAX}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              value={text}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => setKind(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={sending || !text.trim()}
              onClick={handleSend}
              type="button"
              variant={kind === "objection" ? "destructive" : "default"}
            >
              {kind ? COPY[kind].action : ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {reauthDialog}
    </>
  );
}
