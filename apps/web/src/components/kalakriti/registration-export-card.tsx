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
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";
import { exportKalakritiRegistration } from "@/functions/kalakriti-registration-export";
import { downloadCsvFiles } from "@/lib/csv-export";
import { buildKalakritiRegistrationCsvFiles } from "@/lib/kalakriti-registration-export";

export function RegistrationExportCard({ year }: { year: number }) {
  const exportRegistration = useServerFn(exportKalakritiRegistration);
  const [isExporting, setIsExporting] = useState(false);
  const handleExport = useEventCallback(async () => {
    setIsExporting(true);
    try {
      const data = await exportRegistration({
        data: { year },
      });
      if (!data) {
        toast.error("You no longer have access to this registration export");
        return;
      }
      downloadCsvFiles(
        buildKalakritiRegistrationCsvFiles(year, data),
        `kalakriti-${year}-registration.zip`
      );
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
