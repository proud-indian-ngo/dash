import { Button } from "@pi-dash/design-system/components/ui/button";
import { isTemporaryR2Key } from "@pi-dash/shared/asset-ref";
import {
  ALLOWED_KALAKRITI_SCORECARD_TYPES,
  MAX_KALAKRITI_SCORECARD_FILES,
  MAX_KALAKRITI_SCORECARD_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { SelectField } from "@/components/form/select-field";
import {
  deleteTemporaryUpload,
  getKalakritiScorecardUploadUrl,
} from "@/functions/attachments";
import type { KalakritiResultDetail } from "@/functions/kalakriti-results";
import { getProtectedAttachmentHref } from "@/lib/attachment-links";
import { uploadKalakritiScorecard } from "@/lib/kalakriti-scorecard-upload";
import { handleMutationResult } from "@/lib/mutation-result";

type ScorecardClaim = Awaited<ReturnType<typeof uploadKalakritiScorecard>>;
const resultSchema = z.object({
  winnerEntryId: z.string(),
  runnerUpEntryId: z.string(),
  scorecardIds: z.array(z.string()),
  uploads: z.array(
    z.object({
      id: z.string(),
      fileName: z.string(),
      mimeType: z.enum(ALLOWED_KALAKRITI_SCORECARD_TYPES),
      byteSize: z
        .number()
        .int()
        .positive()
        .max(MAX_KALAKRITI_SCORECARD_SIZE_BYTES),
      objectKey: z.string(),
    })
  ),
});

interface FailedFile {
  id: string;
  file: File;
  error: string;
}

export function ResultEditor({
  detail,
  writable,
  onSaved,
  onCancel,
  onReload,
  onBusyChange,
}: {
  detail: KalakritiResultDetail;
  writable: boolean;
  onSaved: () => Promise<void>;
  onCancel: () => void;
  onReload: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [editingDetail] = useState(detail);
  const stale = detail.version !== editingDetail.version;
  const canEdit = writable && !stale;
  const zero = useZero();
  const deleteUpload = useServerFn(deleteTemporaryUpload);
  const getUploadUrl = useServerFn(getKalakritiScorecardUploadUrl);
  const [failures, setFailures] = useState<FailedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    onBusyChange(uploading || busy);
    return () => onBusyChange(false);
  }, [uploading, busy, onBusyChange]);
  const [formError, setFormError] = useState<string | null>(null);
  const stagedKeys = useRef(new Set<string>());
  const submissionIntent = useRef<"draft" | "published">("published");
  const mounted = useRef(true);
  const form = useForm({
    defaultValues: {
      winnerEntryId: editingDetail.winnerEntryId ?? "",
      runnerUpEntryId: editingDetail.runnerUpEntryId ?? "",
      scorecardIds: editingDetail.scorecards.map((file) => file.id),
      uploads: [] as ScorecardClaim[],
    },
    validators: { onChange: resultSchema, onSubmit: resultSchema },
    onSubmit: async ({ value }) => {
      const status = submissionIntent.current;
      submissionIntent.current = "published";
      if (!canEdit || uploading || busy || failures.length) return;
      const selected = [value.winnerEntryId, value.runnerUpEntryId];
      if (status === "published") {
        if (detail.entries.filter((entry) => entry.eligible).length < 2) {
          setFormError(
            "At least two attended, registered entries are required."
          );
          return;
        }
        if (!selected[0] || !selected[1] || selected[0] === selected[1]) {
          setFormError(
            "Choose two different entries for winner and runner-up."
          );
          return;
        }
        if (
          selected.some(
            (id) =>
              !detail.entries.some((entry) => entry.id === id && entry.eligible)
          )
        ) {
          setFormError(
            "Every member of each awarded entry must have recorded attendance for this session."
          );
          return;
        }
        if (value.scorecardIds.length + value.uploads.length < 1) {
          setFormError(
            "Attach at least one judge scorecard before publishing."
          );
          return;
        }
      }
      setFormError(null);
      setBusy(true);
      try {
        const result = await zero.mutate(
          mutators.kalakritiResult.save({
            editionId: editingDetail.editionId,
            divisionId: editingDetail.divisionId,
            resultId: editingDetail.resultId ?? uuidv7(),
            revisionId: uuidv7(),
            expectedVersion: editingDetail.version,
            now: Date.now(),
            status,
            winnerEntryId: value.winnerEntryId || null,
            runnerUpEntryId: value.runnerUpEntryId || null,
            scorecardIds: value.scorecardIds,
            uploads: value.uploads,
          })
        ).server;
        handleMutationResult(result, {
          mutation: "kalakritiResult.save",
          entityId: editingDetail.divisionId,
          successMsg:
            status === "published" ? "Results published" : "Draft saved",
          errorMsg: "Could not save results",
        });
        if (result.type !== "error") {
          stagedKeys.current.clear();
          await onSaved();
        }
      } catch (error) {
        log.error({
          component: "ResultEditor",
          action: "save",
          divisionId: editingDetail.divisionId,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error("Could not save results");
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const key of stagedKeys.current) {
        if (isTemporaryR2Key(key))
          void deleteUpload({ data: { key } }).catch((error: unknown) => {
            log.error({
              component: "ResultEditor",
              action: "discard",
              error: error instanceof Error ? error.message : String(error),
            });
          });
      }
    };
  }, [deleteUpload]);

  const addFiles = async (files: File[], retryId?: string) => {
    if (!canEdit || uploading || busy) return;
    const current = form.state.values;
    const retainedFailures = failures.filter((item) => item.id !== retryId);
    if (
      current.scorecardIds.length +
        current.uploads.length +
        retainedFailures.length +
        files.length >
      MAX_KALAKRITI_SCORECARD_FILES
    ) {
      setFormError(`Attach up to ${MAX_KALAKRITI_SCORECARD_FILES} scorecards.`);
      return;
    }
    setFormError(null);
    setFailures(retainedFailures);
    setUploading(true);
    for (const file of files) {
      try {
        const claim = await uploadKalakritiScorecard(
          file,
          {
            editionId: editingDetail.editionId,
            divisionId: editingDetail.divisionId,
          },
          getUploadUrl,
          deleteUpload
        );
        if (!mounted.current) {
          if (isTemporaryR2Key(claim.objectKey))
            await deleteUpload({ data: { key: claim.objectKey } });
          continue;
        }
        stagedKeys.current.add(claim.objectKey);
        form.setFieldValue("uploads", (previous) => [...previous, claim]);
      } catch (error) {
        log.error({
          component: "ResultEditor",
          action: "uploadScorecard",
          editionId: editingDetail.editionId,
          divisionId: editingDetail.divisionId,
          error: error instanceof Error ? error.message : String(error),
        });
        if (mounted.current)
          setFailures((previous) => [
            ...previous,
            {
              id: retryId ?? uuidv7(),
              file,
              error: error instanceof Error ? error.message : "Upload failed",
            },
          ]);
      }
    }
    if (mounted.current) setUploading(false);
  };
  const removeUpload = async (claim: ScorecardClaim) => {
    if (!canEdit || uploading || busy) return;
    form.setFieldValue("uploads", (previous) =>
      previous.filter((item) => item.id !== claim.id)
    );
    if (isTemporaryR2Key(claim.objectKey)) {
      try {
        await deleteUpload({ data: { key: claim.objectKey } });
        stagedKeys.current.delete(claim.objectKey);
      } catch (error) {
        log.error({
          component: "ResultEditor",
          action: "removeUpload",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  const eligibleEntries = detail.entries.filter((entry) => entry.eligible);
  const options = eligibleEntries.map((entry) => ({
    value: entry.id,
    label: `${entry.label} · ${entry.centerName}`,
  }));
  return (
    <FormLayout form={form}>
      {stale ? (
        <p className="text-destructive text-sm" role="alert">
          Results changed while you were editing. Your selections are preserved.
          Reload the current result before saving.{" "}
          <Button type="button" size="sm" variant="outline" onClick={onReload}>
            Reload results
          </Button>
        </p>
      ) : null}
      {eligibleEntries.length < 2 ? (
        <p className="text-muted-foreground text-sm">
          Publishing requires two distinct registered Entries whose members have
          attendance recorded for this session.
        </p>
      ) : null}
      <fieldset className="grid gap-4" disabled={!canEdit || uploading || busy}>
        <SelectField
          label="Winner"
          name="winnerEntryId"
          options={options}
          placeholder="Choose an entry"
        />
        <SelectField
          label="Runner-up"
          name="runnerUpEntryId"
          options={options}
          placeholder="Choose an entry"
        />
        <CustomField<string[]>
          label="Judge scorecards"
          name="scorecardIds"
          description="PDF, JPEG, or PNG. Up to 10 files, 20 MB each."
        >
          {(field) => (
            <div className="grid gap-2">
              {editingDetail.scorecards.map((file) => {
                const retained = field.state.value.includes(file.id);
                return (
                  <div
                    className="flex items-center gap-2 text-sm"
                    key={file.id}
                  >
                    <a
                      className="min-w-0 break-all underline"
                      href={getProtectedAttachmentHref({
                        kind: "kalakritiScorecard",
                        id: file.id,
                      })}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {file.fileName}
                    </a>
                    {canEdit ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          field.handleChange(
                            retained
                              ? field.state.value.filter((id) => id !== file.id)
                              : [...field.state.value, file.id]
                          )
                        }
                      >
                        {retained ? "Remove" : "Keep"}
                      </Button>
                    ) : null}
                  </div>
                );
              })}
              <form.Subscribe selector={(state) => state.values.uploads}>
                {(uploads) =>
                  uploads.map((file) => (
                    <div
                      className="flex items-center gap-2 text-sm"
                      key={file.id}
                    >
                      <span className="min-w-0 break-all">
                        {file.fileName} · Ready
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void removeUpload(file)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))
                }
              </form.Subscribe>
              {failures.map((failure) => (
                <div
                  className="flex items-center gap-2 text-sm"
                  key={failure.id}
                >
                  <span role="alert">
                    {failure.file.name}: {failure.error}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void addFiles([failure.file], failure.id)}
                  >
                    Retry
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setFailures((previous) =>
                        previous.filter((item) => item.id !== failure.id)
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {canEdit ? (
                <input
                  aria-label="Upload judge scorecards"
                  accept=".pdf,.jpg,.jpeg,.png"
                  multiple
                  type="file"
                  disabled={uploading || busy}
                  onChange={(event) => {
                    const files = [...(event.currentTarget.files ?? [])];
                    event.currentTarget.value = "";
                    void addFiles(files);
                  }}
                />
              ) : null}
            </div>
          )}
        </CustomField>
        {formError ? (
          <p className="text-destructive text-sm" role="alert">
            {formError}
          </p>
        ) : null}
      </fieldset>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          {editingDetail.status === "draft" ? (
            <Button
              type="button"
              variant="outline"
              disabled={uploading || busy || failures.length > 0}
              onClick={() => {
                submissionIntent.current = "draft";
                void form.handleSubmit();
              }}
            >
              Save draft
            </Button>
          ) : null}
          <FormActions
            disabled={
              uploading ||
              busy ||
              failures.length > 0 ||
              eligibleEntries.length < 2
            }
            onCancel={busy ? undefined : onCancel}
            cancelLabel="Cancel changes"
            submitLabel={
              editingDetail.status === "published"
                ? "Publish correction"
                : "Publish results"
            }
            submittingLabel="Publishing..."
          />
        </div>
      ) : writable ? (
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel changes
        </Button>
      ) : null}
    </FormLayout>
  );
}
