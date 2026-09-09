import {
  Button,
  buttonVariants,
} from "@pi-dash/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { log } from "evlog";
import { useEffect, useRef, useState } from "react";

import { getProtectedAttachmentHref } from "@/lib/attachment-links";

export function EntryMusicPlaybackDialog({
  entryId,
  musicFileName,
  onOpenChange,
}: {
  entryId: string;
  musicFileName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [failed, setFailed] = useState(false);
  const ref = { id: entryId, kind: "kalakritiEntryMusic" } as const;
  const handleError = useEventCallback(() => {
    setFailed(true);
    log.error({
      component: "EntryMusicPlaybackDialog",
      action: "playEntryMusic",
      entryId,
      mediaErrorCode: audioRef.current?.error?.code ?? null,
      error: "Entry music playback failed",
    });
  });
  const handleRetry = useEventCallback(() => {
    setFailed(false);
    audioRef.current?.load();
  });
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, []);
  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Play music</DialogTitle>
          <DialogDescription className="break-all">
            {musicFileName}
          </DialogDescription>
        </DialogHeader>
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- Entry music uploads don't include caption tracks. */}
        <audio
          aria-label={`Play ${musicFileName}`}
          className="w-full"
          controls
          onError={handleError}
          preload="metadata"
          ref={audioRef}
          src={getProtectedAttachmentHref(ref, "inline")}
        />
        {failed ? (
          <div className="grid gap-2">
            <p role="alert">
              Audio could not be played. Try again or download the file.
            </p>
            <Button onClick={handleRetry} type="button" variant="outline">
              Retry playback
            </Button>
          </div>
        ) : null}
        <a
          className={buttonVariants({ variant: "outline" })}
          href={getProtectedAttachmentHref(ref)}
        >
          Download
        </a>
      </DialogContent>
    </Dialog>
  );
}
