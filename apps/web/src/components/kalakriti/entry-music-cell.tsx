import { Button } from "@pi-dash/design-system/components/ui/button";

export function EntryMusicCell({
  canWrite,
  musicFiles,
  onEdit,
  onPlay,
}: {
  canWrite: boolean;
  musicFiles: readonly { id: string; fileName: string }[];
  onEdit: () => void;
  onPlay: (file: { id: string; fileName: string }) => void;
}) {
  return (
    <div className="grid gap-2" data-testid="entry-music">
      <span className="text-muted-foreground text-sm">
        {musicFiles.length} {musicFiles.length === 1 ? "file" : "files"}
      </span>
      {musicFiles.map((file) => (
        <Button
          key={file.id}
          className="max-w-40 justify-start p-0 text-sm"
          onClick={() => onPlay(file)}
          type="button"
          variant="link"
        >
          <span className="truncate">{file.fileName}</span>
        </Button>
      ))}
      {canWrite ? (
        <Button onClick={onEdit} size="sm" type="button" variant="outline">
          {musicFiles.length ? "Edit music" : "Upload music"}
        </Button>
      ) : null}
    </div>
  );
}
