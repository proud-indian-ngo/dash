import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { SelectField } from "@/components/form/select-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";

const sourceSchema = z.object({
  sourceEditionId: z.string().min(1, "Choose an Edition"),
});

function idMap(rows: readonly { id: string }[]) {
  return rows.map((row) => ({ sourceId: row.id, targetId: uuidv7() }));
}

function retryFailedQueries(
  results: readonly { retry?: () => void; type: string }[]
) {
  for (const result of results) {
    if (result.type === "error") {
      result.retry?.();
    }
  }
}

type CloneCardAvailability = "hidden" | "query_error" | "ready";

function getCloneCardAvailability({
  editionsResultType,
  lifecycle,
  sourceOptionCount,
  targetHasStructure,
  targetIsAvailable,
  targetResultType,
}: {
  editionsResultType: string;
  lifecycle: string;
  sourceOptionCount: number;
  targetHasStructure: boolean;
  targetIsAvailable: boolean;
  targetResultType: string;
}): CloneCardAvailability {
  if (lifecycle !== "draft") {
    return "hidden";
  }
  if (editionsResultType === "error" || targetResultType === "error") {
    return "query_error";
  }
  if (
    sourceOptionCount === 0 ||
    targetResultType !== "complete" ||
    !targetIsAvailable ||
    targetHasStructure
  ) {
    return "hidden";
  }
  return "ready";
}

function CloneCardUnavailable({
  availability,
  onRetry,
}: {
  availability: Exclude<CloneCardAvailability, "ready">;
  onRetry: () => void;
}) {
  if (availability === "hidden") {
    return null;
  }
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Reuse yearly structure</CardTitle>
        <CardDescription>
          Start from a prior Edition without copying Centers, Sessions, people,
          assignments, or registrations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3" role="alert">
        <p className="font-medium">
          Edition configuration could not be loaded.
        </p>
        <p className="text-muted-foreground text-sm">
          Check your connection and try again.
        </p>
        <Button onClick={onRetry} type="button" variant="outline">
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

function CloneSourceError({
  editionName,
  onRetry,
  visible,
}: {
  editionName: string;
  onRetry: () => void;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }
  return (
    <div className="space-y-3" role="alert">
      <p className="font-medium">{editionName} could not be loaded.</p>
      <p className="text-muted-foreground text-sm">
        Check your connection and try again.
      </p>
      <Button onClick={onRetry} type="button" variant="outline">
        Retry
      </Button>
    </div>
  );
}

function CloneSourceForm({
  editions,
  onCancel,
  onSelect,
}: {
  editions: readonly { id: string; name: string; year: number }[];
  onCancel: () => void;
  onSelect: (editionId: string) => void;
}) {
  const form = useForm({
    defaultValues: { sourceEditionId: "" },
    onSubmit: ({ value }) => onSelect(value.sourceEditionId),
    validators: { onChange: sourceSchema, onSubmit: sourceSchema },
  });
  return (
    <FormLayout form={form} showSubmitError>
      <SelectField
        description="Only active Age Categories, Competition definitions, and Venues are copied."
        isRequired
        label="Source Edition"
        name="sourceEditionId"
        options={editions.map((edition) => ({
          label: `${edition.name} (${edition.year})`,
          value: edition.id,
        }))}
        placeholder="Select an Edition"
      />
      <FormActions
        cancelLabel="Cancel"
        onCancel={onCancel}
        submitLabel="Review clone"
        submittingLabel="Preparing..."
      />
    </FormLayout>
  );
}

export function EditionCloneCard({
  editionId,
  lifecycle,
}: {
  editionId: string;
  lifecycle: string;
}) {
  const zero = useZero();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [sourceEditionId, setSourceEditionId] = useState<string | null>(null);
  const [editions, editionsResult] = useQuery(
    queries.kalakritiEdition.configurationAccessible()
  );
  const [source, sourceResult] = useQuery(
    queries.kalakritiEdition.cloneSource({
      editionId: sourceEditionId ?? "00000000-0000-0000-0000-000000000000",
    }),
    { enabled: sourceEditionId !== null }
  );
  const [target, targetResult] = useQuery(
    queries.kalakritiEdition.cloneSource({ editionId })
  );
  const sourceEdition = editions.find(
    (edition) => edition.id === sourceEditionId
  );
  const sourceOptions = editions.filter((edition) => edition.id !== editionId);
  const activeCompetitionCategories =
    source?.competitionCategories.filter(
      (category) => category.retiredAt === null
    ) ?? [];
  const activeCompetitionCategoryIds = new Set(
    activeCompetitionCategories.map((category) => category.id)
  );
  const activeCompetitions =
    source?.competitions.filter(
      (competition) =>
        competition.retiredAt === null &&
        competition.cancelledAt === null &&
        activeCompetitionCategoryIds.has(competition.competitionCategoryId)
    ) ?? [];
  const activeVenues =
    source?.venues.filter((venue) => venue.retiredAt === null) ?? [];
  const clone = useConfirmAction({
    mutationMeta: {
      entityId: editionId,
      errorMsg: "Couldn't clone Edition configuration",
      mutation: "kalakritiEdition.cloneConfiguration",
      successMsg: "Edition configuration cloned",
    },
    onConfirm: () => {
      if (!source) {
        return Promise.resolve({
          error: { message: "Source configuration is not available" },
          type: "error",
        });
      }
      return zero.mutate(
        mutators.kalakritiEdition.cloneConfiguration({
          ageCategoryIds: idMap(source.ageCategories),
          auditEntryId: uuidv7(),
          competitionCategoryIds: idMap(activeCompetitionCategories),
          competitionIds: idMap(activeCompetitions),
          confirmed: true,
          now: Date.now(),
          sourceEditionId: source.id,
          targetEditionId: editionId,
          venueIds: idMap(activeVenues),
        })
      ).server;
    },
    onSuccess: () => {
      setSourceEditionId(null);
      router.invalidate();
    },
  });

  const handleDialogChange = useEventCallback((open: boolean) => {
    if (open) {
      setFormKey((key) => key + 1);
    }
    setDialogOpen(open);
  });
  const handleSourceSelected = useEventCallback((selectedEditionId: string) => {
    setDialogOpen(false);
    setSourceEditionId(selectedEditionId);
  });
  const handleConfirmChange = useEventCallback((open: boolean) => {
    if (!open) {
      clone.cancel();
      setSourceEditionId(null);
    }
  });
  const handleOpen = useEventCallback(() => handleDialogChange(true));
  const handleCancel = useEventCallback(() => setDialogOpen(false));
  const retryBaseQueries = useEventCallback(() =>
    retryFailedQueries([editionsResult, targetResult])
  );
  const retrySource = useEventCallback(() =>
    retryFailedQueries([sourceResult])
  );
  const sourceLoading =
    sourceEditionId !== null &&
    sourceResult.type !== "complete" &&
    sourceResult.type !== "error";
  const sourceFailed =
    sourceEditionId !== null && sourceResult.type === "error";
  const cloneableRowCount = source
    ? source.ageCategories.length +
      activeCompetitionCategories.length +
      activeCompetitions.length +
      activeVenues.length
    : 0;
  const sourceIsEmpty =
    sourceResult.type === "complete" &&
    source !== undefined &&
    cloneableRowCount === 0;

  useEffect(() => {
    if (sourceEditionId && source && sourceResult.type === "complete") {
      clone.trigger();
    }
  }, [clone.trigger, source, sourceEditionId, sourceResult.type]);

  const targetHasStructure =
    target !== undefined &&
    (target.ageCategories.length > 0 ||
      target.competitionCategories.length > 0 ||
      target.competitions.length > 0 ||
      target.venues.length > 0);
  const availability = getCloneCardAvailability({
    editionsResultType: editionsResult.type,
    lifecycle,
    sourceOptionCount: sourceOptions.length,
    targetHasStructure,
    targetIsAvailable: target !== undefined,
    targetResultType: targetResult.type,
  });

  if (availability !== "ready") {
    return (
      <CloneCardUnavailable
        availability={availability}
        onRetry={retryBaseQueries}
      />
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Reuse yearly structure</CardTitle>
        <CardDescription>
          Start from a prior Edition without copying Centers, Sessions, people,
          assignments, or registrations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={handleOpen} variant="outline">
          Clone configuration
        </Button>
        <CloneSourceError
          editionName={sourceEdition?.name ?? "Source Edition"}
          onRetry={retrySource}
          visible={sourceFailed}
        />
      </CardContent>

      <Dialog onOpenChange={handleDialogChange} open={dialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clone Edition configuration</DialogTitle>
            <DialogDescription>
              Choose the Edition whose active structural configuration should be
              copied.
            </DialogDescription>
          </DialogHeader>
          <CloneSourceForm
            editions={sourceOptions}
            key={formKey}
            onCancel={handleCancel}
            onSelect={handleSourceSelected}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        confirmDisabled={sourceIsEmpty}
        confirmLabel="Clone configuration"
        description={
          sourceIsEmpty
            ? `${sourceEdition?.name ?? "The selected Edition"} has no active structural configuration to copy. Choose another Edition.`
            : `Copy ${cloneableRowCount} active structural records from ${sourceEdition?.name ?? "the selected Edition"}? The target Edition must not already have structural configuration.`
        }
        loading={sourceLoading || clone.isLoading}
        loadingLabel={sourceLoading ? "Loading configuration..." : "Cloning..."}
        onConfirm={clone.confirm}
        onOpenChange={handleConfirmChange}
        open={clone.isOpen}
        title={
          sourceIsEmpty
            ? "No configuration to clone"
            : "Clone this configuration?"
        }
        variant="default"
      />
    </Card>
  );
}
