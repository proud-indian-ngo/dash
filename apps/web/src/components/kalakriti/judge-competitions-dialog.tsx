import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { Loader } from "@/components/loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { handleMutationResult } from "@/lib/mutation-result";

import type { AttendeeRow } from "./attendees-table";

const schema = z.object({ competitionIds: z.array(z.string()) });
export function JudgeCompetitionsDialog({
  attendee,
  editionId,
  onClose,
}: {
  attendee: AttendeeRow;
  editionId: string;
  onClose: () => void;
}) {
  const zero = useZero();
  const [competitions, result] = useQuery(
    queries.kalakritiCompetition.competitions({ editionId })
  );
  const form = useForm({
    defaultValues: {
      competitionIds: attendee.judgeAssignments.map((a) => a.competitionId),
    },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      const response = await zero.mutate(
        mutators.kalakritiAttendee.setCompetitions({
          ...value,
          id: attendee.id,
          editionId,
          now: Date.now(),
          auditEntryId: uuidv7(),
        })
      ).server;
      handleMutationResult(response, {
        mutation: "kalakritiAttendee.setCompetitions",
        entityId: attendee.id,
        successMsg: "Judge assignments saved",
        errorMsg: "Assignments could not be saved",
      });
      if (response.type !== "error") onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent aria-label="Assign competitions" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign competitions</DialogTitle>
          <DialogDescription>
            Select competitions for {attendee.name}. Clear all selections to
            remove assignments.
          </DialogDescription>
        </DialogHeader>
        {result.type !== "complete" ? (
          <Loader />
        ) : (
          <FormLayout form={form} showSubmitError>
            <CustomField<string[]> label="Competitions" name="competitionIds">
              {(field) => (
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {competitions.map((competition) => (
                    <label
                      className="flex items-center gap-2 text-sm"
                      key={competition.id}
                    >
                      <input
                        type="checkbox"
                        checked={field.state.value.includes(competition.id)}
                        onChange={(event) =>
                          field.handleChange(
                            event.target.checked
                              ? [...field.state.value, competition.id]
                              : field.state.value.filter(
                                  (id) => id !== competition.id
                                )
                          )
                        }
                      />
                      {competition.name}
                    </label>
                  ))}
                  {competitions.length === 0 ? (
                    <p>No competitions available.</p>
                  ) : null}
                </div>
              )}
            </CustomField>
            <FormActions
              onCancel={onClose}
              submitLabel="Save assignments"
              submittingLabel="Saving..."
            />
          </FormLayout>
        )}
      </DialogContent>
    </Dialog>
  );
}
