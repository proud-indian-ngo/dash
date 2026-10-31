import {
  ArrowDown01Icon,
  Download04Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Button,
  buttonVariants,
} from "@pi-dash/design-system/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@pi-dash/design-system/components/ui/collapsible";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { MEETING_NOTES_MAX } from "@pi-dash/shared/meetings";
import {
  esignLapsed,
  SIGNING_MODE_LABELS,
  type SigningMode,
  signingModeValues,
} from "@pi-dash/shared/resolutions";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FilePreviewButton } from "@/components/shared/file-preview";
import {
  collectMinutesEsignFn,
  generateMinutesFn,
  getMinutesEsignLinkFn,
  getMinutesUploadUrl,
  submitSignedMinutesFn,
} from "@/functions/meetings";
import { getEsignAvailableFn } from "@/functions/resolutions";
import { getProtectedAttachmentHref } from "@/lib/attachment-links";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

import { DscSignSection } from "./dsc-sign-section";
import { EsignSignSection } from "./esign-sign-section";
import { governanceDocumentHref } from "./evidence";
import { errorText, type MeetingDetail } from "./meeting-data";
import { SegmentedChoice } from "./segmented-choice";
import { useVoteReauth } from "./use-vote-reauth";

/**
 * After the meeting: the proceedings for the minutes, the generated PDF,
 * and the chair's signature: with their DSC, through the helper or a copy
 * signed in Acrobat, or with Aadhaar eSign on Leegality, as chosen when
 * the minutes are made.
 */
export function MeetingMinutesPanel({
  canManage,
  isChair,
  meeting,
}: {
  canManage: boolean;
  /** The signed-in person chaired the meeting. */
  isChair: boolean;
  meeting: MeetingDetail;
}) {
  const zero = useZero();
  const generate = useServerFn(generateMinutesFn);
  const presign = useServerFn(getMinutesUploadUrl);
  const submit = useServerFn(submitSignedMinutesFn);
  const esignLink = useServerFn(getMinutesEsignLinkFn);
  const collectEsign = useServerFn(collectMinutesEsignFn);
  const esignAvailable = useServerFn(getEsignAvailableFn);
  // Null until known; making the minutes waits for it.
  const [canEsign, setCanEsign] = useState<boolean | null>(null);
  const [mode, setMode] = useState<SigningMode>(
    meeting.minutesSigningMode ?? "dsc"
  );
  const [checking, setChecking] = useState(false);
  const [notes, setNotes] = useState(meeting.notes ?? "");
  const [generating, setGenerating] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { dialog: reauthDialog, runVote } = useVoteReauth();
  // Without the helper, Acrobat is the only way, so it shows open.
  const [dscAvailable, setDscAvailable] = useState<boolean | null>(null);
  const signed = !!meeting.minutesDocumentId;

  useEffect(() => {
    if (!canManage || signed) {
      return;
    }
    let current = true;
    esignAvailable()
      .then(({ available }) => {
        if (current) {
          setCanEsign(available);
        }
      })
      .catch((error: unknown) => {
        if (current) {
          setCanEsign(false);
        }
        log.error({
          action: "meeting.esign.available",
          caughtError: errorText(error, "unknown"),
          component: "MeetingMinutesPanel",
        });
      });
    return () => {
      current = false;
    };
  }, [canManage, esignAvailable, signed]);
  const href = getProtectedAttachmentHref({
    id: meeting.id,
    kind: "meetingMinutes",
  });
  const esignMode = meeting.minutesSigningMode === "esign";
  const lapsed =
    esignMode && esignLapsed(new Date(meeting.updatedAt))
      ? "The chair's Leegality invitation has lapsed. A governance manager makes the minutes again to send a new one."
      : undefined;

  const saveNotes = useEventCallback(async () => {
    const result = await zero.mutate(
      mutators.meeting.setNotes({ id: meeting.id, notes })
    ).server;
    handleMutationResult(result, {
      entityId: meeting.id,
      errorMsg: `Couldn't save: ${getMutationResultErrorMessage(result.type === "error" ? result.error : undefined, "something went wrong")}`,
      mutation: "meeting.setNotes",
      successMsg: "Proceedings saved",
    });
  });
  const handleGenerate = useEventCallback(async () => {
    setGenerating(true);
    await generate({
      data: { id: meeting.id, signingMode: canEsign ? mode : "dsc" },
    })
      .then(() => {
        toast.success("Minutes ready for the chair to sign");
      })
      .catch((error: unknown) => {
        toast.error("Couldn't make the minutes", {
          description: errorText(error, "Something went wrong"),
        });
      })
      .finally(() => setGenerating(false));
  });
  const handleUpload = useEventCallback(async () => {
    if (!file) {
      return;
    }
    setUploading(true);
    await presign({
      data: { fileName: file.name, fileSize: file.size, id: meeting.id },
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
        await submit({ data: { id: meeting.id, tempKey: key } });
        toast.success("Signed minutes filed in the vault");
        setFile(null);
      })
      .catch((error: unknown) => {
        toast.error("The signed minutes weren't accepted", {
          description: errorText(error, "Something went wrong"),
        });
      })
      .finally(() => setUploading(false));
  });

  const acrobat = (
    <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
      <li>
        <span className="flex flex-wrap items-center gap-2">
          The chair downloads the minutes.
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
            Download minutes
          </a>
        </span>
      </li>
      <li>
        The chair signs the box on the last page in Adobe Acrobat or Reader with
        their DSC token, and saves the signed copy.
      </li>
      <li>
        Upload the signed copy.
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label className="sr-only" htmlFor="signed-minutes-file">
              Signed minutes
            </Label>
            <Input
              accept="application/pdf,.pdf"
              className="max-w-xs"
              id="signed-minutes-file"
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
            {uploading ? "Checking..." : "Upload signed minutes"}
          </Button>
        </div>
      </li>
    </ol>
  );
  const handleCheck = useEventCallback(async () => {
    setChecking(true);
    await collectEsign({ data: { id: meeting.id } })
      .then(({ message }) => toast.success(message))
      .catch((error: unknown) => {
        log.error({
          action: "meeting.esign.collect",
          caughtError: errorText(error, "unknown"),
          component: "MeetingMinutesPanel",
        });
        toast.error("Couldn't take the eSign", {
          description: errorText(error, "Something went wrong"),
        });
      })
      .finally(() => setChecking(false));
  });

  const preview = (
    <FilePreviewButton
      className="text-primary self-start text-sm underline-offset-4 hover:underline"
      fileName="Minutes"
      src={href}
    >
      Preview the minutes sent to Leegality
    </FilePreviewButton>
  );
  let signing = acrobat;
  if (esignMode) {
    signing = (
      <div className="flex flex-col gap-3">
        {preview}
        {isChair ? (
          <EsignSignSection
            action="meeting.sign_minutes"
            collect={() => collectEsign({ data: { id: meeting.id } })}
            lapsed={lapsed}
            link={() => esignLink({ data: { id: meeting.id } })}
          />
        ) : lapsed ? (
          <p className="text-muted-foreground text-sm">{lapsed}</p>
        ) : (
          <div className="flex flex-col items-start gap-2 text-sm">
            <p className="text-muted-foreground">
              The chair signs on Leegality with Aadhaar eSign. Their signature
              is taken within ten minutes, or check now.
            </p>
            <Button
              disabled={checking}
              onClick={handleCheck}
              size="sm"
              type="button"
              variant="outline"
            >
              {checking ? "Checking..." : "Check for the eSign"}
            </Button>
          </div>
        )}
      </div>
    );
  } else if (isChair) {
    signing = (
      <div className="flex flex-col gap-4">
        <DscSignSection
          onAvailability={setDscAvailable}
          onVote={runVote}
          target={{ meetingId: meeting.id }}
        />
        {dscAvailable === false ? (
          acrobat
        ) : (
          <Collapsible>
            <CollapsibleTrigger className="text-primary group flex items-center gap-1 text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 pointer-coarse:min-h-10">
              Sign in Acrobat instead
              <HugeiconsIcon
                className="size-4 transition-transform group-data-[panel-open]:rotate-180"
                icon={ArrowDown01Icon}
                strokeWidth={2}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3" keepMounted>
              {acrobat}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    );
  }

  return (
    <section
      aria-labelledby="minutes-heading"
      className="flex flex-col gap-4 rounded-md border p-4"
    >
      <h2 className="text-base font-semibold" id="minutes-heading">
        Minutes
      </h2>
      {signed && meeting.minutesDocumentId ? (
        <p className="text-sm">
          Signed by the chair and filed in the vault.{" "}
          <FilePreviewButton
            className="text-primary underline-offset-4 hover:underline"
            src={governanceDocumentHref(meeting.minutesDocumentId)}
            fileName={meeting.minutesDocument?.title ?? "Signed minutes"}
          >
            {meeting.minutesDocument?.title ?? "Open the signed minutes"}
          </FilePreviewButton>
        </p>
      ) : null}
      {canManage && !signed ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="meeting-proceedings">Proceedings</Label>
          <Textarea
            id="meeting-proceedings"
            maxLength={MEETING_NOTES_MAX}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opening, matters arising, and the close of the meeting."
            rows={5}
            value={notes}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={notes === (meeting.notes ?? "")}
              onClick={saveNotes}
              type="button"
              variant="outline"
            >
              Save proceedings
            </Button>
          </div>
          {canEsign ? (
            <div className="flex flex-col gap-1.5">
              <span aria-hidden className="text-sm font-medium">
                Signed with
              </span>
              <SegmentedChoice
                label="Signed with"
                onChange={(value) => setMode(value ?? mode)}
                options={signingModeValues.map((value) => ({
                  label: SIGNING_MODE_LABELS[value],
                  value,
                }))}
                value={mode}
              />
            </div>
          ) : null}
          <div>
            <Button
              disabled={generating || canEsign === null}
              onClick={handleGenerate}
              type="button"
            >
              {meeting.minutesObjectKey
                ? "Make the minutes again"
                : "Make the minutes"}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            The minutes are made from the agenda, attendance and votes. Make
            them again after changing the notes.
            {canEsign
              ? " The chair signs them with their DSC, or with Aadhaar eSign on Leegality (a billed eSign)."
              : ""}
          </p>
        </div>
      ) : null}
      {!signed && meeting.minutesObjectKey && (canManage || isChair)
        ? signing
        : null}
      {!(signed || meeting.minutesObjectKey || canManage) ? (
        <p className="text-muted-foreground text-sm">
          The minutes aren't ready yet.
        </p>
      ) : null}
      {reauthDialog}
    </section>
  );
}
