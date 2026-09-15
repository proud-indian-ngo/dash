import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@pi-dash/design-system/components/ui/combobox";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
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
  const [search, setSearch] = useState("");
  const anchor = useComboboxAnchor();
  const [competitions, result] = useQuery(
    queries.kalakritiCompetition.competitions({ editionId })
  );
  const filteredCompetitions = competitions.filter((competition) =>
    competition.name
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase())
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
                <Combobox
                  multiple
                  filter={null}
                  inputValue={search}
                  onInputValueChange={setSearch}
                  value={field.state.value}
                  onValueChange={field.handleChange}
                >
                  <ComboboxChips ref={anchor}>
                    {field.state.value.map((id) => (
                      <ComboboxChip key={id}>
                        {competitions.find(
                          (competition) => competition.id === id
                        )?.name ?? id}
                      </ComboboxChip>
                    ))}
                    <ComboboxChipsInput
                      id={field.name}
                      onBlur={field.handleBlur}
                      placeholder="Search competitions..."
                    />
                  </ComboboxChips>
                  <ComboboxContent anchor={anchor}>
                    <ComboboxList>
                      {filteredCompetitions.map((competition) => (
                        <ComboboxItem
                          key={competition.id}
                          value={competition.id}
                        >
                          {competition.name}
                        </ComboboxItem>
                      ))}
                      {filteredCompetitions.length === 0 ? (
                        <p className="text-muted-foreground p-2 text-sm">
                          {competitions.length
                            ? "No matching competitions found."
                            : "No competitions available."}
                        </p>
                      ) : null}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
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
