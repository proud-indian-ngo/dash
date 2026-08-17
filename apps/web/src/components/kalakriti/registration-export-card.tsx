import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";

export function useRegistrationExport(year: number) {
  const [isExporting, setIsExporting] = useState(false);
  const exportRegistration = useEventCallback(async () => {
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
        component: "useRegistrationExport",
        error: error instanceof Error ? error.message : String(error),
        year,
      });
      toast.error("Registration export could not be downloaded");
    }
    setIsExporting(false);
  });
  return { exportRegistration, isExporting };
}
