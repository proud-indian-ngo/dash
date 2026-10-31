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
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { SigningMode } from "@pi-dash/shared/resolutions";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";

import {
  collectCircularEsignaturesFn,
  getCircularEsignLinkFn,
  getCircularSigningCopyUrl,
  getCircularSignUploadUrl,
  submitSignedCircularFn,
} from "@/functions/resolutions";

import { DscSignSection } from "./dsc-sign-section";
import { EsignSignSection } from "./esign-sign-section";
import { useVoteReauth } from "./use-vote-reauth";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * A trustee signs a circular once: the signature assents to every
 * resolution they haven't objected to or declared a conflict on. On a DSC
 * circular their answers are filled into the PDF beside their box before
 * they sign; on an Aadhaar eSign one they sign on Leegality only.
 */
export function CircularSignPanel({
  assents,
  circularId,
  otherAnswers,
  signingMode,
}: {
  /** Positions of the open resolutions signing assents to. */
  assents: number[];
  circularId: string;
  /** Their objections and conflicts, as the signature will record them. */
  otherAnswers: string[];
  signingMode: SigningMode;
}) {
  const { dialog: reauthDialog, runVote } = useVoteReauth();
  const esignLink = useServerFn(getCircularEsignLinkFn);
  const collectEsign = useServerFn(collectCircularEsignaturesFn);
  const presign = useServerFn(getCircularSignUploadUrl);
  const submit = useServerFn(submitSignedCircularFn);
  const copyUrl = useServerFn(getCircularSigningCopyUrl);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Without the helper, the other ways are the only ways, so they show open.
  const [dscAvailable, setDscAvailable] = useState<boolean | null>(null);

  const handleDownload = useEventCallback(async () => {
    setDownloading(true);
    await copyUrl({ data: { circularId } })
      .then(({ url }) => {
        window.location.href = url;
      })
      .catch((error: unknown) => {
        toast.error("Couldn't prepare your copy", {
          description: errorText(error, "Something went wrong"),
        });
      })
      .finally(() => setDownloading(false));
  });

  const handleUpload = useEventCallback(async () => {
    if (!file) {
      return;
    }
    setUploading(true);
    await presign({
      data: { circularId, fileName: file.name, fileSize: file.size },
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
        return runVote(() => submit({ data: { circularId, tempKey: key } }));
      })
      .then((result) => {
        if (result) {
          toast.success(result.message);
          setFile(null);
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "circular.sign",
          caughtError: errorText(error, "unknown"),
          component: "CircularSignPanel",
        });
        toast.error("Your signature wasn't accepted", {
          description: errorText(error, "Something went wrong"),
        });
      })
      .finally(() => setUploading(false));
  });

  const acrobat = (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Adobe Acrobat</h3>
      <ol className="text-muted-foreground flex list-decimal flex-col gap-2 pl-5 text-sm">
        <li>
          <button
            className="text-primary underline-offset-4 hover:underline disabled:opacity-50 pointer-coarse:min-h-10"
            disabled={downloading}
            onClick={handleDownload}
            type="button"
          >
            {downloading ? "Preparing your copy..." : "Download your copy"}
          </button>{" "}
          (your answers are filled in)
        </li>
        <li>
          Sign the box beside your name in Acrobat or Reader with your DSC
          token, and save.
        </li>
        <li>
          Upload the signed copy. If someone signs first, or you change an
          answer, download it again.
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

  return (
    <section
      aria-labelledby="my-signature-heading"
      className="flex flex-col gap-4 rounded-md border p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold" id="my-signature-heading">
          Your signature
        </h2>
        <p className="text-muted-foreground text-sm">
          Signing assents to{" "}
          {assents.length === 1
            ? `resolution ${assents[0]}`
            : `resolutions ${assents.join(", ")}`}
          {otherAnswers.length > 0
            ? signingMode === "dsc"
              ? ` and records that you ${otherAnswers.join("; ")}`
              : `; that you ${otherAnswers.join("; ")} stays recorded here`
            : ""}
          . Object to or declare a conflict on any of them first
          {signingMode === "esign"
            ? ": once you've signed on Leegality, you can't"
            : ""}
          .
        </p>
      </div>
      {signingMode === "esign" ? (
        <EsignSignSection
          action="circular.sign"
          collect={() => collectEsign({ data: { circularId } })}
          link={() => esignLink({ data: { circularId } })}
        />
      ) : (
        <>
          <DscSignSection
            onAvailability={setDscAvailable}
            onVote={runVote}
            target={{ circularId }}
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
              <CollapsibleContent className="flex flex-col gap-4 pt-3">
                {acrobat}
              </CollapsibleContent>
            </Collapsible>
          )}
        </>
      )}
      {reauthDialog}
    </section>
  );
}
