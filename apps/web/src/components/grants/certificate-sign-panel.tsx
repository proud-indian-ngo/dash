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
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { esignLapsed, type SigningMode } from "@pi-dash/shared/resolutions";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { DscSignSection } from "@/components/governance/dsc-sign-section";
import { EsignSignSection } from "@/components/governance/esign-sign-section";
import { errorText } from "@/components/governance/meeting-data";
import { useVoteReauth } from "@/components/governance/use-vote-reauth";
import {
  collectCertificateEsignFn,
  getCertificateEsignLinkFn,
  getCertificateUploadUrl,
  submitSignedCertificateFn,
} from "@/functions/utilisation-certificates";

/** Puts a file to its presigned upload and returns the temporary key. */
export async function uploadCertificateFile(
  presign: (input: {
    data: {
      fileName: string;
      fileSize: number;
      id: string;
      purpose: "ca" | "signed";
    };
  }) => Promise<{ key: string; presignedUrl: string }>,
  input: { file: File; id: string; purpose: "ca" | "signed" }
): Promise<string> {
  const { key, presignedUrl } = await presign({
    data: {
      fileName: input.file.name,
      fileSize: input.file.size,
      id: input.id,
      purpose: input.purpose,
    },
  });
  const put = await fetch(presignedUrl, {
    body: input.file,
    headers: { "Content-Type": "application/pdf" },
    method: "PUT",
  });
  if (!put.ok) {
    throw new Error("The upload didn't go through. Try again.");
  }
  return key;
}

/**
 * The trustee whose turn it is signs the certificate's latest copy: with
 * their DSC, through the helper or a copy signed in Acrobat, or with
 * Aadhaar eSign on Leegality, as chosen when it was prepared.
 */
export function CertificateSignPanel({
  certificateId,
  latestHref,
  preparedAt,
  signingMode,
}: {
  certificateId: string;
  latestHref: string;
  preparedAt: number;
  signingMode: SigningMode;
}) {
  const esignLink = useServerFn(getCertificateEsignLinkFn);
  const collectEsign = useServerFn(collectCertificateEsignFn);
  const presign = useServerFn(getCertificateUploadUrl);
  const submit = useServerFn(submitSignedCertificateFn);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { dialog: reauthDialog, runVote } = useVoteReauth();
  // Without the helper, Acrobat is the only way, so it shows open.
  const [dscAvailable, setDscAvailable] = useState<boolean | null>(null);

  const handleUpload = useEventCallback(async () => {
    if (!file) {
      return;
    }
    setUploading(true);
    await uploadCertificateFile(presign, {
      file,
      id: certificateId,
      purpose: "signed",
    })
      .then(async (tempKey) => {
        await submit({ data: { id: certificateId, tempKey } });
        toast.success("Your signature is on the certificate");
        setFile(null);
      })
      .catch((error: unknown) => {
        toast.error("The signed certificate wasn't accepted", {
          description: errorText(error, "Something went wrong"),
        });
      })
      .finally(() => setUploading(false));
  });

  const acrobat = (
    <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
      <li>
        <span className="flex flex-wrap items-center gap-2">
          Download the certificate.
          <a
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={latestHref}
            rel="noreferrer"
            target="_blank"
          >
            <HugeiconsIcon
              className="size-4"
              icon={Download04Icon}
              strokeWidth={2}
            />
            Download certificate
          </a>
        </span>
      </li>
      <li>
        Sign the box with your name on the last page in Adobe Acrobat or Reader
        with your DSC token, and save the signed copy.
      </li>
      <li>
        Upload the signed copy.
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label className="sr-only" htmlFor="signed-certificate-file">
              Signed certificate
            </Label>
            <Input
              accept="application/pdf,.pdf"
              className="max-w-xs"
              id="signed-certificate-file"
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
            {uploading ? "Checking..." : "Upload signed certificate"}
          </Button>
        </div>
      </li>
    </ol>
  );

  if (signingMode === "esign") {
    return (
      <EsignSignSection
        action="utilisation_certificate.sign"
        collect={() => collectEsign({ data: { id: certificateId } })}
        lapsed={
          esignLapsed(new Date(preparedAt))
            ? "Your Leegality invitation has lapsed. Finance withdraws the certificate and prepares it again to send a new one."
            : undefined
        }
        link={() => esignLink({ data: { id: certificateId } })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <DscSignSection
        onAvailability={setDscAvailable}
        onVote={runVote}
        target={{ certificateId }}
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
      {reauthDialog}
    </div>
  );
}
