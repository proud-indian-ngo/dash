import { Button } from "@pi-dash/design-system/components/ui/button";

export function EntryMusicCell({
  canWrite,
  musicFileName,
  onEdit,
  onPlay,
}: {
  canWrite: boolean;
  musicFileName: string | null;
  onEdit: () => void;
  onPlay: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="entry-music"
    >
      {musicFileName ? (
        <Button
          className="max-w-40 justify-start p-0 text-sm"
          onClick={onPlay}
          type="button"
          variant="link"
        >
          <span className="truncate">{musicFileName}</span>
        </Button>
      ) : (
        <span className="text-muted-foreground text-sm">None</span>
      )}
      {canWrite ? (
        <Button onClick={onEdit} size="sm" type="button" variant="outline">
          {musicFileName ? "Edit music" : "Upload music"}
        </Button>
      ) : null}
    </div>
  );
}
