import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@pi-dash/design-system/components/ui/collapsible";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useCallback, useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { SelectField } from "@/components/form/select-field";
import { TextareaField } from "@/components/form/textarea-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { getKalakritiStandings } from "@/functions/kalakriti-results";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { handleMutationResult } from "@/lib/mutation-result";

import { KALAKRITI_SUMMARY_COLORS } from "./summary-colors";
import { useResultSnapshot } from "./use-result-snapshot";

type Standings = Awaited<ReturnType<typeof getKalakritiStandings>>;

function RunnerUpSelection({
  candidates,
  selectedId,
  onSelect,
}: {
  candidates: Standings["centers"];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  useEffect(() => {
    if (!candidates.some((center) => center.id === selectedId)) {
      const nextId = candidates[0]?.id ?? "";
      if (nextId !== selectedId) onSelect(nextId);
    }
  }, [candidates, selectedId, onSelect]);
  return (
    <SelectField
      label="Overall runner-up"
      name="runnerUpCenterId"
      options={candidates.map((center) => ({
        value: center.id,
        label: center.name,
      }))}
      disabled={candidates.length === 1}
    />
  );
}

function FinalizeForm({
  standings,
  refresh,
}: {
  standings: Standings;
  refresh: () => Promise<void>;
}) {
  const zero = useZero();
  const [error, setError] = useState<string | null>(null);
  const ordered = [...standings.centers].sort(
    (a, b) =>
      b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name)
  );
  const equalScore = (
    a: Standings["centers"][number],
    b: Standings["centers"][number]
  ) => a.points === b.points && a.wins === b.wins;
  const firstPlace = ordered[0];
  const secondPlace = ordered[1];
  const leaders = firstPlace
    ? ordered.filter((center) => equalScore(center, firstPlace))
    : [];
  const second =
    leaders.length > 1
      ? leaders
      : secondPlace
        ? ordered.filter((center) => equalScore(center, secondPlace))
        : [];
  const tie = leaders.length > 1 || second.length > 1;
  const form = useForm({
    defaultValues: {
      winnerCenterId: leaders[0]?.id ?? "",
      runnerUpCenterId:
        second.find((center) => center.id !== leaders[0]?.id)?.id ?? "",
      tieReason: "",
    },
    validators: {
      onChange: z.object({
        winnerCenterId: z.string(),
        runnerUpCenterId: z.string(),
        tieReason: z.string(),
      }),
      onSubmit: z.object({
        winnerCenterId: z.string(),
        runnerUpCenterId: z.string(),
        tieReason: z.string(),
      }),
    },
    onSubmit: async ({ value }) => {
      if (
        !leaders.some((center) => center.id === value.winnerCenterId) ||
        !second.some((center) => center.id === value.runnerUpCenterId) ||
        value.winnerCenterId === value.runnerUpCenterId
      ) {
        setError("Choose valid, distinct Centers from the tied ranking.");
        return;
      }
      if (tie && !value.tieReason.trim()) {
        setError("Record why this tie was resolved in this order.");
        return;
      }
      setError(null);
      const result = await zero.mutate(
        mutators.kalakritiResult.finalize({
          editionId: standings.editionId,
          revisionId: uuidv7(),
          expectedVersion: standings.version,
          now: Date.now(),
          winnerCenterId: value.winnerCenterId,
          runnerUpCenterId: value.runnerUpCenterId,
          tieReason: tie ? value.tieReason.trim() : null,
        })
      ).server;
      handleMutationResult(result, {
        mutation: "kalakritiResult.finalize",
        entityId: standings.editionId,
        successMsg: "Overall results finalized",
        errorMsg: "Could not finalize results",
      });
      if (result.type !== "error") await refresh();
    },
  });
  if (ordered.length < 2) return null;
  return (
    <FormLayout form={form}>
      <div className="grid gap-3 border-t pt-4">
        <h3 className="font-medium">Declare overall results</h3>
        <SelectField
          label="Overall winner"
          name="winnerCenterId"
          options={leaders.map((center) => ({
            value: center.id,
            label: center.name,
          }))}
          disabled={leaders.length === 1}
        />
        <form.Subscribe selector={(state) => state.values.winnerCenterId}>
          {(winnerCenterId) => (
            <form.Subscribe selector={(state) => state.values.runnerUpCenterId}>
              {(runnerUpCenterId) => (
                <RunnerUpSelection
                  candidates={second.filter(
                    (center) => center.id !== winnerCenterId
                  )}
                  selectedId={runnerUpCenterId}
                  onSelect={(id) => form.setFieldValue("runnerUpCenterId", id)}
                />
              )}
            </form.Subscribe>
          )}
        </form.Subscribe>
        {tie ? (
          <TextareaField
            label="Tie resolution reason"
            name="tieReason"
            isRequired
            description="Explain the ordering of Centers tied on points and wins."
          />
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <FormActions
          submitLabel="Finalize overall results"
          submittingLabel="Finalizing..."
        />
      </div>
    </FormLayout>
  );
}

export function CenterStandings({ year }: { year: number }) {
  const zero = useZero();
  const load = useCallback(
    () => getKalakritiStandings({ data: { year } }),
    [year]
  );
  const { data, fresh, error, refresh } = useResultSnapshot(String(year), load);
  const reopen = useConfirmAction({
    mutationMeta: {
      mutation: "kalakritiResult.reopen",
      entityId: data?.editionId ?? "",
      successMsg: "Overall results reopened",
      errorMsg: "Could not reopen results",
    },
    onConfirm: () =>
      zero.mutate(
        mutators.kalakritiResult.reopen({
          editionId: data?.editionId ?? "",
          revisionId: uuidv7(),
          expectedVersion: data?.version ?? -1,
          now: Date.now(),
        })
      ).server,
    onSuccess: () => void refresh(),
  });
  const winner = data?.centers.find(
    (center) => center.id === data.winnerCenterId
  );
  const runnerUp = data?.centers.find(
    (center) => center.id === data.runnerUpCenterId
  );
  const leaders =
    data && data.publishedCount > 0
      ? data.centers.filter((center) => center.rank === 1)
      : [];
  return (
    <Card
      aria-label="Center standings"
      className={KALAKRITI_SUMMARY_COLORS.results}
      size="sm"
    >
      <CardHeader>
        <CardTitle>
          <h2>Center standings</h2>
        </CardTitle>
        <Badge variant={data?.finalizedAt ? "default" : "secondary"}>
          {data?.finalizedAt ? "Final" : "Live"}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3">
        {error || !fresh ? (
          <p
            className="text-muted-foreground text-sm"
            role={error ? "alert" : undefined}
          >
            {error
              ? "Standings could not be refreshed. Actions are paused."
              : "Checking current standings..."}{" "}
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
        {data ? (
          <>
            <p className="text-muted-foreground text-sm tabular-nums">
              {data.publishedCount} of {data.totalCount} competitions published
            </p>
            {data.finalizedAt ? (
              <div className="bg-primary/5 grid gap-1 rounded-md p-3">
                <p className="font-semibold">
                  Overall winner: {winner?.name ?? "Unavailable"} ·{" "}
                  {winner?.points ?? 0} points
                </p>
                <p>
                  Overall runner-up: {runnerUp?.name ?? "Unavailable"} ·{" "}
                  {runnerUp?.points ?? 0} points
                </p>
              </div>
            ) : leaders.length ? (
              <p className="font-medium">
                {leaders.length === 1 ? "Leading" : "Tied for lead"}:{" "}
                {leaders.map((center) => center.name).join(", ")}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                The lead will appear after the first result is published.
              </p>
            )}
            <Collapsible>
              <CollapsibleTrigger className="hover:bg-muted/50 focus-visible:ring-ring flex min-h-11 w-full cursor-pointer items-center justify-between text-sm font-medium focus-visible:ring-2 sm:min-h-10">
                View Center standings <span aria-hidden="true">+</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-x-auto">
                <table className="w-full min-w-110 text-sm">
                  <caption className="sr-only">
                    All participating Center scores
                  </caption>
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2">Rank</th>
                      <th>Center</th>
                      <th className="text-right">Points</th>
                      <th className="text-right">Wins</th>
                      <th className="text-right">Runner-up finishes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.centers.map((center) => (
                      <tr className="border-b last:border-0" key={center.id}>
                        <td className="py-2 tabular-nums">{center.rank}</td>
                        <td>{center.name}</td>
                        <td className="text-right tabular-nums">
                          {center.points}
                        </td>
                        <td className="text-right tabular-nums">
                          {center.wins}
                        </td>
                        <td className="text-right tabular-nums">
                          {center.runnerUps}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CollapsibleContent>
            </Collapsible>
            {data.centers.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No participating Centers yet.
              </p>
            ) : null}
            {data.canFinalize &&
            data.canWrite &&
            fresh &&
            !data.finalizedAt &&
            data.totalCount > 0 &&
            data.publishedCount === data.totalCount ? (
              <FinalizeForm
                key={data.version}
                standings={data}
                refresh={refresh}
              />
            ) : null}
            {data.canFinalize && data.canWrite && fresh && data.finalizedAt ? (
              <Button
                className="justify-self-start"
                type="button"
                variant="outline"
                onClick={reopen.trigger}
              >
                Reopen overall results
              </Button>
            ) : null}
          </>
        ) : null}
      </CardContent>
      <ConfirmDialog
        title="Reopen overall results?"
        description="The final declaration will be cleared and standings will return to Live. Published Competition results remain in the standings."
        confirmLabel="Reopen results"
        confirmDisabled={!fresh || !data?.canFinalize || !data.canWrite}
        loading={reopen.isLoading}
        open={reopen.isOpen}
        onConfirm={reopen.confirm}
        onOpenChange={(open) => {
          if (!open) reopen.cancel();
        }}
      />
    </Card>
  );
}
