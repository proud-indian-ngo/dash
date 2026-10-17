import { Download04Icon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Button,
  buttonVariants,
} from "@pi-dash/design-system/components/ui/button";
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

  return (
    <section
      aria-labelledby="my-response-heading"
      className="flex flex-col gap-4 rounded-md border p-4"
    >
      <h2 className="text-base font-semibold" id="my-response-heading">
        Your response
      </h2>
      <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
        <li>
          <span className="flex flex-wrap items-center gap-2">
            Download the circular.
            <a
              className={buttonVariants({ size: "sm", variant: "outline" })}
              href={href}
              rel="noreferrer"
              target="_blank"
            >
              <HugeiconsIcon
                className="size-4"
                icon={Download04Icon}
                strokeWidth={2}
              />
              Download PDF
            </a>
          </span>
        </li>
        <li>
          {fieldsPrepared
            ? "Open it in Adobe Acrobat or Reader, click the box beside your name on the signature page, and sign with your DSC token. Save the signed copy."
            : "Open it in Adobe Acrobat or Reader, choose Use a certificate, draw your signature over the box beside your name on the signature page, and sign with your DSC token. Save the signed copy."}
        </li>
        <li>
          Upload the signed copy. If someone else signs first, download it again
          and sign that copy.
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label className="sr-only" htmlFor="signed-circular-file">
                Signed circular
              </Label>
              <Input
                accept="application/pdf,.pdf"
                className="max-w-xs"
                id="signed-circular-file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                type="file"
              />
            </div>
            <Button
              disabled={!file || uploading}
              onClick={handleUpload}
              type="button"
            >
              <HugeiconsIcon
                className="size-4"
                icon={Upload04Icon}
                strokeWidth={2}
              />
              {uploading ? "Checking signature..." : "Upload signed copy"}
            </Button>
          </div>
        </li>
      </ol>
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button
          onClick={() => setKind("objection")}
          type="button"
          variant="outline"
        >
          Object
        </Button>
        <Button
          onClick={() => setKind("conflict")}
          type="button"
          variant="ghost"
        >
          Declare a conflict of interest
        </Button>
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
