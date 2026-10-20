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
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  getDeclarationUploadUrl,
  submitSignedDeclarationFn,
} from "@/functions/declarations";
import { getProtectedAttachmentHref } from "@/lib/attachment-links";

import { DscSignSection } from "./dsc-sign-section";
import { errorText } from "./meeting-data";
import { useVoteReauth } from "./use-vote-reauth";

/**
 * The trustee signs their declaration waiting for signature with their DSC,
 * through the helper or a copy signed in Acrobat.
 */
export function DeclarationSignPanel({
  declarationId,
}: {
  declarationId: string;
}) {
  const presign = useServerFn(getDeclarationUploadUrl);
  const submit = useServerFn(submitSignedDeclarationFn);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { dialog: reauthDialog, runVote } = useVoteReauth();
  // Without the helper, Acrobat is the only way, so it shows open.
  const [dscAvailable, setDscAvailable] = useState<boolean | null>(null);
  const href = getProtectedAttachmentHref({
    id: declarationId,
    kind: "declarationPdf",
  });

  const handleUpload = useEventCallback(async () => {
    if (!file) {
      return;
    }
    setUploading(true);
    await presign({
      data: { fileName: file.name, fileSize: file.size, id: declarationId },
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
        await submit({ data: { id: declarationId, tempKey: key } });
        toast.success("Signed declaration filed in the vault");
        setFile(null);
      })
      .catch((error: unknown) => {
        toast.error("The signed declaration wasn't accepted", {
          description: errorText(error, "Something went wrong"),
        });
      })
      .finally(() => setUploading(false));
  });

  const acrobat = (
    <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
      <li>
        <span className="flex flex-wrap items-center gap-2">
          Download your declaration.
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
            Download declaration
          </a>
        </span>
      </li>
      <li>
        Sign the box on the last page in Adobe Acrobat or Reader with your DSC
        token, and save the signed copy.
      </li>
      <li>
        Upload the signed copy.
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label className="sr-only" htmlFor="signed-declaration-file">
              Signed declaration
            </Label>
            <Input
              accept="application/pdf,.pdf"
              className="max-w-xs"
              id="signed-declaration-file"
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
            {uploading ? "Checking..." : "Upload signed declaration"}
          </Button>
        </div>
      </li>
    </ol>
  );

  return (
    <div className="flex flex-col gap-4">
      <DscSignSection
        onAvailability={setDscAvailable}
        onVote={runVote}
        target={{ declarationId }}
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
