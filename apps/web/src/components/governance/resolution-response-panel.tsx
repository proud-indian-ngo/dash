import { ArrowDown01Icon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@pi-dash/design-system/components/ui/collapsible";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { OBJECTION_REASON_MAX } from "@pi-dash/shared/resolutions";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
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
  getResolutionSignUploadUrl,
  objectToResolutionFn,
  submitSignedResolutionFn,
} from "@/functions/resolutions";
import { getProtectedAttachmentHref } from "@/lib/attachment-links";

import { DscSignSection } from "./dsc-sign-section";
import { EsignSection } from "./esign-section";
import { useVoteReauth } from "./use-vote-reauth";

type Kind = "objection" | "conflict";

const COPY: Record<
  Kind,
  { action: string; description: string; label: string; title: string }
> = {
  conflict: {
    action: "Declare conflict",
    description:
      "You have a personal interest in this decision (clause 5.3). You won't respond, and you're left out of the count.",
    label: "What is the interest?",
    title: "Declare a conflict of interest",
  },
  objection: {
    action: "Record objection",
    description:
      "An objection is recorded with your reason and shown to the Board. You don't sign the PDF.",
    label: "Reason",
    title: "Object to this resolution",
  },
};

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** What a trustee does with a circular sent to them: sign it, object, or declare a conflict. */
export function ResolutionResponsePanel({
  fieldsPrepared,
  resolutionId,
}: {
  fieldsPrepared: boolean;
  resolutionId: string;
}) {
  const { dialog: reauthDialog, runVote } = useVoteReauth();
  const presign = useServerFn(getResolutionSignUploadUrl);
  const submit = useServerFn(submitSignedResolutionFn);
  const object = useServerFn(objectToResolutionFn);
  const conflict = useServerFn(declareResolutionConflictFn);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<Kind | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  // Without the helper, the other ways are the only ways, so they show open.
  const [dscAvailable, setDscAvailable] = useState<boolean | null>(null);
  // An eSign still with Leegality opens the other ways, so its status shows.
  const [othersOpen, setOthersOpen] = useState(false);
  const openOthers = useEventCallback(() => setOthersOpen(true));
  const href = getProtectedAttachmentHref({
    id: resolutionId,
    kind: "resolutionPdf",
  });

  const handleUpload = useEventCallback(async () => {
    if (!file) {
      return;
    }
    setUploading(true);
    await presign({
      data: { fileName: file.name, fileSize: file.size, id: resolutionId },
    })
      .then(async ({ key, presignedUrl }) => {
        const put = await fetch(presignedUrl, {
          body: file,
          headers: { "Content-Type": "application/pdf" },
          method: "PUT",
        });
        if (!put.ok) {
          throw new Error("The upload didn't go through. Try again.");
        }
        return runVote(() =>
          submit({ data: { id: resolutionId, tempKey: key } })
        );
      })
      .then((result) => {
        if (result) {
          toast.success(
            result.status === "passed"
              ? `Signed. The resolution passed as ${result.number ?? ""}.`
              : "Signed. Your signature is on the circular."
          );
          setFile(null);
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "resolution.sign",
          caughtError: errorText(error, "unknown"),
          component: "ResolutionResponsePanel",
        });
        toast.error("Your signature wasn't accepted", {
          description: errorText(error, "Something went wrong"),
        });
      })
      .finally(() => setUploading(false));
  });

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
          setText("");
        }
      })
      .catch((error: unknown) => {
        toast.error("That wasn't recorded", {
          description: errorText(error, "Something went wrong"),
        });
      })
      .finally(() => setSending(false));
  });

  const acrobat = (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Adobe Acrobat</h3>
      <ol className="text-muted-foreground flex list-decimal flex-col gap-2 pl-5 text-sm">
        <li>
          <a
            className="text-primary underline-offset-4 hover:underline"
            href={href}
            rel="noreferrer"
            target="_blank"
          >
            Download PDF
          </a>
        </li>
        <li>
          {fieldsPrepared
            ? "Sign the box beside your name in Acrobat or Reader with your DSC token, and save."
            : "In Acrobat or Reader, choose Use a certificate, draw over the box beside your name, sign with your DSC token, and save."}
        </li>
        <li>
          Upload the signed copy. If someone signs first, download it again.
        </li>
      </ol>
      <Label className="sr-only" htmlFor="signed-circular-file">
        Signed circular
      </Label>
      <Input
        accept="application/pdf,.pdf"
        id="signed-circular-file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        type="file"
      />
      <Button
        disabled={!file || uploading}
        onClick={handleUpload}
        type="button"
        variant="outline"
      >
        <HugeiconsIcon className="size-4" icon={Upload04Icon} strokeWidth={2} />
        {uploading ? "Checking signature..." : "Upload signed copy"}
      </Button>
    </div>
  );
  const otherWays = (
    <>
      <EsignSection
        onVote={runVote}
        onWaiting={openOthers}
        resolutionId={resolutionId}
      />
      {acrobat}
    </>
  );

  return (
    <section
      aria-labelledby="my-response-heading"
      className="flex flex-col gap-4 rounded-md border p-4"
    >
      <h2 className="text-base font-semibold" id="my-response-heading">
        Your response
      </h2>
      <DscSignSection
        onAvailability={setDscAvailable}
        onVote={runVote}
        resolutionId={resolutionId}
      />
      {dscAvailable === false ? (
        otherWays
      ) : (
        <Collapsible onOpenChange={setOthersOpen} open={othersOpen}>
          <CollapsibleTrigger className="text-primary group flex items-center gap-1 text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3">
            Other ways to sign
            <HugeiconsIcon
              className="size-4 transition-transform group-data-[panel-open]:rotate-180"
              icon={ArrowDown01Icon}
              strokeWidth={2}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-4 pt-3" keepMounted>
            {otherWays}
          </CollapsibleContent>
        </Collapsible>
      )}
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-sm">
        <button
          className="hover:text-foreground underline-offset-4 hover:underline"
          onClick={() => setKind("objection")}
          type="button"
        >
          Object
        </button>
        <button
          className="hover:text-foreground underline-offset-4 hover:underline"
          onClick={() => setKind("conflict")}
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
            <Label htmlFor="response-text">
              {kind ? COPY[kind].label : ""}
            </Label>
            <Textarea
              id="response-text"
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
    </section>
  );
}
