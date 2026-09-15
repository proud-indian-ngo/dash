import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";

export function IdCardDownloadButton({ year }: { year: number }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const download = useEventCallback(async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/kalakriti/${year}/id-cards`);
      if (!response.ok) {
        const body: unknown = await response.json();
        throw new Error(
          body &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
            ? body.error
            : "ID cards could not be downloaded"
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `kalakriti-${year}-id-cards.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("ID cards downloaded");
    } catch (error) {
      log.error({
        component: "IdCardDownloadButton",
        action: "downloadIdCards",
        year,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(
        error instanceof Error
          ? error.message
          : "ID cards could not be downloaded"
      );
    } finally {
      setIsDownloading(false);
    }
  });
  return (
    <Button
      type="button"
      variant="outline"
      disabled={isDownloading}
      onClick={download}
    >
      {isDownloading ? "Preparing ID cards..." : "Download ID cards"}
    </Button>
  );
}
