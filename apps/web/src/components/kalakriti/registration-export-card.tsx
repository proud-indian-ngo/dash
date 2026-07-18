import { FileDownloadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";

export function RegistrationExportCard({ year }: { year: number }) {
  const [isExporting, setIsExporting] = useState(false);
  const handleExport = useEventCallback(async () => {
    setIsExporting(true);
    try {
      const response = await fetch(
        `/api/kalakriti/${year}/registration-export`
      );
      if (!response.ok) {
        throw new Error(`Registration export failed (${response.status})`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `kalakriti-${year}-registration.zip`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success("Registration export downloaded");
    } catch (error) {
      log.error({
        action: "exportRegistration",
        component: "RegistrationExportCard",
        error: error instanceof Error ? error.message : String(error),
        year,
      });
      toast.error("Registration export could not be downloaded");
    } finally {
      setIsExporting(false);
    }
  });

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Export registration data</CardTitle>
        <CardDescription>
          Download Student and Competition Entry CSV files limited to your
          assigned registration scope.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled={isExporting} onClick={handleExport} type="button">
          <HugeiconsIcon icon={FileDownloadIcon} strokeWidth={2} />
          {isExporting ? "Preparing export..." : "Download registration data"}
        </Button>
      </CardContent>
    </Card>
  );
}
