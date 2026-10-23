import { Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { UDIN_PATTERN } from "@pi-dash/shared/utilisation-certificates";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { errorText } from "@/components/governance/meeting-data";
import {
  getCertificateUploadUrl,
  recordCertificateCaFn,
} from "@/functions/utilisation-certificates";

import { uploadCertificateFile } from "./certificate-sign-panel";

/**
 * Finance records the CA's certificate once both trustees have signed: the
 * UDIN and either the CA-countersigned PDF or the CA's separate report.
 */
export function CertificateCaPanel({
  certificateId,
}: {
  certificateId: string;
}) {
  const presign = useServerFn(getCertificateUploadUrl);
  const record = useServerFn(recordCertificateCaFn);
  const [udin, setUdin] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const normalised = udin.trim().toUpperCase();
  const udinValid = UDIN_PATTERN.test(normalised);

  const handleSave = useEventCallback(async () => {
    if (!(file && udinValid)) {
      return;
    }
    setSaving(true);
    await uploadCertificateFile(presign, {
      file,
      id: certificateId,
      purpose: "ca",
    })
      .then(async (tempKey) => {
        await record({
          data: {
            fileName: file.name,
            id: certificateId,
            tempKey,
            udin: normalised,
          },
        });
        toast.success("CA certificate recorded. The certificate is final.");
        setFile(null);
        setUdin("");
      })
      .catch((error: unknown) => {
        toast.error("The CA certificate wasn't recorded", {
          description: errorText(error, "Something went wrong"),
        });
      })
      .finally(() => setSaving(false));
  });

  return (
    <div className="flex max-w-md flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ca-udin">UDIN</Label>
        <Input
          aria-invalid={udin !== "" && !udinValid}
          autoComplete="off"
          id="ca-udin"
          onChange={(e) => setUdin(e.target.value)}
          value={udin}
        />
        <p className="text-muted-foreground text-xs">
          The 18-character number on the CA's certificate.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ca-file">CA's certificate</Label>
        <Input
          accept="application/pdf,.pdf"
          id="ca-file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          type="file"
        />
        <p className="text-muted-foreground text-xs">
          The certificate the CA countersigned, or the CA's separate report, as
          a PDF.
        </p>
      </div>
      <Button
        className="w-fit"
        disabled={!(file && udinValid) || saving}
        onClick={handleSave}
        type="button"
      >
        <HugeiconsIcon className="size-4" icon={Upload04Icon} strokeWidth={2} />
        {saving ? "Recording..." : "Record CA certificate"}
      </Button>
    </div>
  );
}
