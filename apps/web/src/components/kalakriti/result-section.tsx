import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@pi-dash/design-system/components/ui/dialog";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { type ReactNode, useCallback, useState } from "react";
import { uuidv7 } from "uuidv7";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { getKalakritiResultDetail } from "@/functions/kalakriti-results";
import { useConfirmAction } from "@/hooks/use-confirm-action";

import { ResultEditor } from "./result-editor";
import { useResultSnapshot } from "./use-result-snapshot";

export function ResultSection({
  divisionId,
  year,
  children,
}: {
  divisionId: string;
  year: number;
  children: (action: ReactNode) => ReactNode;
}) {
  const zero = useZero();
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () => getKalakritiResultDetail({ data: { year, divisionId } }),
    [year, divisionId]
  );
  const {
    data: detail,
    fresh,
    error,
    refresh,
  } = useResultSnapshot(`${year}:${divisionId}`, load);
  const withdraw = useConfirmAction({
    mutationMeta: {
      mutation: "kalakritiResult.withdraw",
      entityId: divisionId,
      successMsg: "Results withdrawn",
      errorMsg: "Could not withdraw results",
    },
    onConfirm: () =>
      zero.mutate(
        mutators.kalakritiResult.withdraw({
          editionId: detail?.editionId ?? "",
          divisionId,
          revisionId: uuidv7(),
          expectedVersion: detail?.version ?? -1,
          now: Date.now(),
        })
      ).server,
    onSuccess: () => void refresh(),
  });

  if (!detail) return children(null);
  const entryLabel = (id: string | null) =>
    id
      ? (detail.entries.find((entry) => entry.id === id)?.label ??
        "Entry unavailable")
      : "Unassigned";
  const reloadEditor = () => setEditorEpoch((epoch) => epoch + 1);
  const afterSave = async () => {
    await refresh();
    setOpen(false);
  };
  const handleOpenChange = (nextOpen: boolean) => {
    if (busy) return;
    if (nextOpen) reloadEditor();
    setOpen(nextOpen);
  };
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {detail.status === "published" ? (
        <section aria-label="Published results" className="grid gap-3">
          <h2 className="text-lg font-semibold">Results</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { title: "Winner", entryId: detail.winnerEntryId },
              { title: "Runner-up", entryId: detail.runnerUpEntryId },
            ].map(({ title, entryId }) => {
              const entry = detail.entries.find((row) => row.id === entryId);
              return (
                <div
                  key={title}
                  className="bg-card ring-foreground/15 grid gap-1 p-4 ring-1"
                >
                  <h3 className="text-primary font-semibold">{title}</h3>
                  <p className="font-medium">{entryLabel(entryId)}</p>
                  {entry ? (
                    <p className="text-muted-foreground text-sm">
                      {entry.centerName}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          {!fresh ? (
            <p role="status" className="text-muted-foreground text-sm">
              Showing the last published results while checking for updates.
            </p>
          ) : null}
        </section>
      ) : null}
      {children(
        <DialogTrigger render={<Button type="button" />}>
          {!detail.canWrite
            ? "View results"
            : detail.status === "published"
              ? "Edit results"
              : "Assign results"}
        </DialogTrigger>
      )}
      <DialogContent
        className="max-h-[85dvh] overflow-y-auto sm:max-w-md"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>Results</DialogTitle>
          <DialogDescription>
            Upload judge scorecards and assign the winner and runner-up for this
            event.
          </DialogDescription>
        </DialogHeader>
        <Badge
          className="justify-self-start"
          variant={detail.status === "published" ? "default" : "secondary"}
        >
          {detail.status === "published" ? "Published" : "Draft"}
        </Badge>
        {error || !fresh ? (
          <p
            className="text-muted-foreground text-sm"
            role={error ? "alert" : undefined}
          >
            {error
              ? "Results could not be refreshed. Editing is paused."
              : "Checking current results..."}{" "}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void refresh()}
            >
              Retry
            </Button>
          </p>
        ) : null}
        {open ? (
          <>
            <ResultEditor
              key={`${divisionId}:${editorEpoch}`}
              detail={detail}
              writable={Boolean(fresh && detail.canWrite)}
              onSaved={afterSave}
              onCancel={() => handleOpenChange(false)}
              onReload={reloadEditor}
              onBusyChange={setBusy}
            />
            {detail.status === "published" && detail.canWrite && fresh ? (
              <Button
                className="justify-self-start"
                type="button"
                variant="outline"
                disabled={busy}
                onClick={withdraw.trigger}
              >
                Withdraw published results
              </Button>
            ) : null}
            {detail.revisions.length ? (
              <details className="text-sm">
                <summary className="cursor-pointer">
                  Revision history ({detail.revisions.length})
                </summary>
                <ol className="mt-2 grid gap-1">
                  {detail.revisions.map((revision) => (
                    <li key={revision.version}>
                      Version {revision.version} · {revision.status} · Winner:{" "}
                      {entryLabel(revision.winnerEntryId)} · Runner-up:{" "}
                      {entryLabel(revision.runnerUpEntryId)} ·{" "}
                      {new Date(revision.createdAt).toLocaleString("en-IN")}
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </>
        ) : null}
        <ConfirmDialog
          title="Withdraw published results?"
          description="This removes the awards from live Center standings until results are published again."
          confirmLabel="Withdraw results"
          confirmDisabled={busy || !fresh || !detail.canWrite}
          loading={withdraw.isLoading}
          open={withdraw.isOpen}
          onConfirm={withdraw.confirm}
          onOpenChange={(open) => {
            if (!open) withdraw.cancel();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
