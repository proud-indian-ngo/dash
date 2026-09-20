import { Button } from "@pi-dash/design-system/components/ui/button";
import type {
  KalakritiAwardEntry,
  KalakritiAwardRecipient as KalakritiAwardMember,
} from "@pi-dash/shared/kalakriti-awards";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { log } from "evlog";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";

import { AwardStudentDetailSheet } from "@/components/kalakriti/award-student-detail-sheet";
import { AwardsTable } from "@/components/kalakriti/awards-table";
import { awardRecipientCounts } from "@/components/kalakriti/awards-table-utils";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { SummaryMetricCards } from "@/components/kalakriti/summary-metric-cards";
import { useResultSnapshot } from "@/components/kalakriti/use-result-snapshot";
import { useApp } from "@/context/app-context";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { getKalakritiAwards } from "@/functions/kalakriti-awards";
import { dashboardAccessKey } from "@/lib/kalakriti-dashboard";
import { handleMutationResult } from "@/lib/mutation-result";

type StudentSelection = {
  award: KalakritiAwardEntry["award"];
  divisionId: string;
  entryId: string;
  studentId: string;
};

function mutationKey(entry: KalakritiAwardEntry, studentId?: string) {
  return `${entry.divisionId}:${entry.entryId}:${entry.award}:${studentId ?? "group"}`;
}

export function AwardsWorkspace({
  access,
}: {
  access: KalakritiEditionAccess;
}) {
  const zero = useZero();
  const { user } = useApp();
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [selection, setSelection] = useState<StudentSelection | null>(null);
  const load = useCallback(
    () => getKalakritiAwards({ data: { year: access.edition.year } }),
    [access.edition.year]
  );
  const { data, error, fresh, refresh } = useResultSnapshot(
    dashboardAccessKey(access, user.id),
    load
  );
  const editionId = data?.editionId;
  const entries = data?.entries ?? [];
  const selectedEntry = selection
    ? entries.find(
        (entry) =>
          entry.divisionId === selection.divisionId &&
          entry.entryId === selection.entryId &&
          entry.award === selection.award
      )
    : undefined;
  const selectedMember = selectedEntry?.members.find(
    (member) => member.studentId === selection?.studentId
  );
  const resolvedSelection =
    selectedEntry && selectedMember
      ? { entry: selectedEntry, member: selectedMember }
      : null;
  const counts = awardRecipientCounts(entries);
  const canWrite = Boolean(data?.canWrite && fresh);

  const isPending = useCallback(
    (entry: KalakritiAwardEntry) => {
      const prefix = `${entry.divisionId}:${entry.entryId}:${entry.award}:`;
      return [...pending].some((key) => key.startsWith(prefix));
    },
    [pending]
  );

  const mutate = useCallback(
    async (
      entry: KalakritiAwardEntry,
      awarded: boolean,
      member?: KalakritiAwardMember
    ) => {
      if (!canWrite || isPending(entry)) return;
      const key = mutationKey(entry, member?.studentId);
      setPending((current) => new Set(current).add(key));
      try {
        const targets = member ? [member] : entry.members;
        const result = await zero.mutate(
          mutators.kalakritiAward.set({
            award: entry.award,
            awarded,
            commandId: uuidv7(),
            divisionId: entry.divisionId,
            editionId: editionId ?? "",
            entryId: entry.entryId,
            expectedVersions: targets.map((target) => ({
              studentId: target.studentId,
              version: target.version,
            })),
            now: Date.now(),
            ...(member ? { studentId: member.studentId } : {}),
          })
        ).server;
        handleMutationResult(result, {
          mutation: "kalakritiAward.set",
          entityId: entry.entryId,
          successMsg: awarded ? "Prize awarded" : "Prize handover undone",
          errorMsg: awarded
            ? "Could not award prize"
            : "Could not undo handover",
        });
      } catch (mutationError) {
        log.error({
          action: "setAwarded",
          component: "AwardsWorkspace",
          entryId: entry.entryId,
          error:
            mutationError instanceof Error
              ? mutationError.message
              : String(mutationError),
        });
        toast.error(
          awarded ? "Could not award prize" : "Could not undo handover"
        );
      }
      await refresh();
      setPending((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    },
    [canWrite, editionId, isPending, refresh, zero]
  );

  return (
    <div className="space-y-4">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${access.edition.year}`}
        title="Awards"
      />
      <p className="text-muted-foreground max-w-3xl text-sm">
        Hand over prizes for published Competition winners and runners-up. Each
        student is tracked separately, including members of group entries.
      </p>
      <SummaryMetricCards
        label="Award handover summary"
        metrics={[
          { label: "Total recipients", value: data ? counts.total : undefined },
          { label: "Awarded", value: data ? counts.awarded : undefined },
          { label: "Pending", value: data ? counts.pending : undefined },
        ]}
      />
      {error || (data && !fresh) ? (
        <div
          className="flex flex-wrap items-center gap-2"
          role={error ? "alert" : "status"}
        >
          <p className="text-muted-foreground text-sm">
            {error
              ? "Awards could not be refreshed. Handover actions are paused."
              : "Showing the last complete Awards roster while checking for updates."}
          </p>
          <Button
            onClick={() => void refresh()}
            size="sm"
            type="button"
            variant="outline"
          >
            Retry
          </Button>
        </div>
      ) : null}
      {data && !data.canWrite ? (
        <p className="text-muted-foreground text-sm">
          Prize handovers are available during the Live Edition.
        </p>
      ) : null}
      <AwardsTable
        canWrite={canWrite}
        data={entries}
        isLoading={!data && !error}
        isPending={isPending}
        onSetAwarded={(entry, member, awarded) => {
          void mutate(entry, awarded, member);
        }}
        onSetGroupAwarded={(entry, awarded) => {
          void mutate(entry, awarded);
        }}
        onViewStudent={(entry, member) =>
          setSelection({
            award: entry.award,
            divisionId: entry.divisionId,
            entryId: entry.entryId,
            studentId: member.studentId,
          })
        }
      />
      <AwardStudentDetailSheet
        selection={resolvedSelection}
        onOpenChange={(open) => {
          if (!open) setSelection(null);
        }}
      />
    </div>
  );
}
