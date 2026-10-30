import { ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Checkbox } from "@pi-dash/design-system/components/ui/checkbox";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { addDays } from "@pi-dash/shared/governance";
import {
  CIRCULAR_RESOLUTIONS_MAX,
  DEFAULT_RESPONSE_DAYS,
  ESIGN_MAX_RESPONSE_DAYS,
  RESOLUTION_TEMPLATES,
  SIGNING_MODE_LABELS,
  type SigningMode,
  signingModeValues,
} from "@pi-dash/shared/resolutions";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { getEsignAvailableFn, issueCircularFn } from "@/functions/resolutions";

import { todayIso } from "./register-data";
import { SegmentedChoice } from "./segmented-choice";

const SIGNING_MODE_HINTS: Record<SigningMode, string> = {
  dsc: "Trustees sign with their DSC token, through the signing helper or in Acrobat.",
  esign: `Trustees sign with Aadhaar eSign on Leegality, by OTP to the phone linked to their Aadhaar. Each signature is a billed eSign, and responses can be due at most ${ESIGN_MAX_RESPONSE_DAYS} days after issue.`,
};

/**
 * Issuing a circular: the Managing Trustee picks the drafts it carries and
 * their order (a designation after the appointment it depends on), the
 * response date and, where Leegality is set up, whether trustees sign with
 * DSCs or Aadhaar eSign.
 */
export function IssueCircularDialog({
  onOpenChange,
  open,
  startId,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** The draft the dialog was opened from; picked to begin with. */
  startId: string;
}) {
  const [drafts] = useQuery(queries.resolution.drafts());
  const issue = useServerFn(issueCircularFn);
  const esignAvailable = useServerFn(getEsignAvailableFn);
  const [canEsign, setCanEsign] = useState(false);
  const [signingMode, setSigningMode] = useState<SigningMode>("dsc");
  const navigate = useNavigate();
  const today = todayIso();
  const [picked, setPicked] = useState<string[]>([startId]);
  const [dueOn, setDueOn] = useState(() =>
    addDays(today, DEFAULT_RESPONSE_DAYS)
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSigningMode("dsc");
    let current = true;
    esignAvailable()
      .then(({ available }) => {
        if (current) {
          setCanEsign(available);
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "circular.esign.available",
          caughtError: error instanceof Error ? error.message : "unknown",
          component: "IssueCircularDialog",
        });
      });
    return () => {
      current = false;
    };
  }, [esignAvailable, open]);

  const byId = new Map(drafts.map((d) => [d.id, d]));
  const chosen = picked.filter((id) => byId.has(id));
  const full = chosen.length >= CIRCULAR_RESOLUTIONS_MAX;

  const toggle = useEventCallback((id: string) =>
    setPicked(
      chosen.includes(id) ? chosen.filter((p) => p !== id) : [...chosen, id]
    )
  );
  const move = useEventCallback((id: string, step: -1 | 1) => {
    const from = chosen.indexOf(id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= chosen.length) {
      return;
    }
    const next = [...chosen];
    next.splice(from, 1);
    next.splice(to, 0, id);
    setPicked(next);
  });

  const handleIssue = useEventCallback(async () => {
    setBusy(true);
    await issue({
      data: {
        resolutionIds: chosen,
        responseDueOn: dueOn,
        signingMode: canEsign ? signingMode : "dsc",
      },
    })
      .then((out) => {
        toast.success(`Issued to ${out.responders} trustees`);
        onOpenChange(false);
        navigate({
          params: { circularId: out.circularId },
          to: "/governance/resolutions/circulars/$circularId",
        });
      })
      .catch((error: unknown) => {
        toast.error("Couldn't issue it", {
          description:
            error instanceof Error ? error.message : "Something went wrong",
        });
      })
      .finally(() => setBusy(false));
  });

  const inOrder = [
    ...chosen.flatMap((id) => {
      const draft = byId.get(id);
      return draft ? [draft] : [];
    }),
    ...drafts.filter((d) => !chosen.includes(d.id)),
  ];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-lg)">
        <DialogHeader>
          <DialogTitle>Issue a circular</DialogTitle>
          <DialogDescription>
            Choose the drafts it carries. They go out as one PDF with a
            signature box for every trustee in office, who sign it once; each
            resolution passes or fails on its own. Only the Managing Trustee can
            issue it (clause 4.18).
          </DialogDescription>
        </DialogHeader>
        <ul
          aria-label="Drafts"
          className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-md border"
        >
          {inOrder.map((draft) => {
            const position = chosen.indexOf(draft.id);
            const checkboxId = `issue-draft-${draft.id}`;
            return (
              <li className="flex items-center gap-3 px-3 py-2" key={draft.id}>
                <Checkbox
                  checked={position >= 0}
                  disabled={position < 0 && full}
                  id={checkboxId}
                  onCheckedChange={() => toggle(draft.id)}
                />
                <label
                  className="flex min-w-0 flex-1 flex-col"
                  htmlFor={checkboxId}
                >
                  <span className="line-clamp-2 text-sm font-medium">
                    {position >= 0 ? `${position + 1}. ` : ""}
                    {draft.title}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {RESOLUTION_TEMPLATES[draft.templateKey].title}
                  </span>
                </label>
                {position >= 0 && chosen.length > 1 ? (
                  <div className="flex gap-1">
                    <Button
                      aria-label={`Move ${draft.title} up`}
                      disabled={position === 0}
                      onClick={() => move(draft.id, -1)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <HugeiconsIcon
                        className="size-4"
                        icon={ArrowUp01Icon}
                        strokeWidth={2}
                      />
                    </Button>
                    <Button
                      aria-label={`Move ${draft.title} down`}
                      disabled={position === chosen.length - 1}
                      onClick={() => move(draft.id, 1)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <HugeiconsIcon
                        className="size-4"
                        icon={ArrowDown01Icon}
                        strokeWidth={2}
                      />
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p
          aria-live="polite"
          className="text-muted-foreground text-sm tabular-nums"
        >
          {chosen.length} of {CIRCULAR_RESOLUTIONS_MAX} picked
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="response-due">Respond by</Label>
          <Input
            id="response-due"
            max={
              canEsign && signingMode === "esign"
                ? addDays(today, ESIGN_MAX_RESPONSE_DAYS)
                : undefined
            }
            min={addDays(today, 1)}
            onChange={(e) => setDueOn(e.target.value)}
            type="date"
            value={dueOn}
          />
        </div>
        {canEsign ? (
          <div className="flex flex-col gap-1.5">
            <span aria-hidden className="text-sm font-medium">
              Signed with
            </span>
            <SegmentedChoice
              label="Signed with"
              onChange={(value) => setSigningMode(value ?? signingMode)}
              options={signingModeValues.map((value) => ({
                label: SIGNING_MODE_LABELS[value],
                value,
              }))}
              value={signingMode}
            />
            <p className="text-muted-foreground text-sm">
              {SIGNING_MODE_HINTS[signingMode]}
            </p>
          </div>
        ) : null}
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={busy || chosen.length === 0}
            onClick={handleIssue}
            type="button"
          >
            {busy
              ? "Issuing..."
              : chosen.length === 1
                ? "Issue to the trustees"
                : `Issue ${chosen.length} resolutions to the trustees`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
