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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { hasValidKalakritiGroupRules } from "@pi-dash/shared/kalakriti";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { CheckboxField } from "@/components/form/checkbox-field";
import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import {
  type FormFieldApi,
  fieldErrorProps,
} from "@/components/form/form-context";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { handleMutationResult } from "@/lib/mutation-result";

const competitionSchema = z
  .object({
    competitionCategoryId: z.string().min(1, "Select a Category"),
    divisions: z
      .array(
        z.object({
          ageCategoryId: z.string(),
          id: z.string(),
        })
      )
      .min(1, "Select at least one Age Category"),
    genderEligibility: z.enum(["male", "female", "both"]),
    maximumGroupSize: z.number().int().min(1).max(100),
    minimumGroupSize: z.number().int().min(1).max(100),
    musicUploadEnabled: z.boolean(),
    name: z.string().trim().min(2).max(120),
    participationMode: z.enum(["individual", "group"]),
  })
  .refine(
    (value) =>
      hasValidKalakritiGroupRules(
        value.participationMode,
        value.minimumGroupSize,
        value.maximumGroupSize
      ),
    {
      message:
        "Individual Competitions require 1 participant; groups require at least 2 and a valid maximum.",
      path: ["maximumGroupSize"],
    }
  );

export interface CompetitionFormValue {
  competitionCategoryId: string;
  divisions: readonly CompetitionDivisionFormValue[];
  genderEligibility: "both" | "female" | "male";
  id: string;
  maximumGroupSize: number;
  minimumGroupSize: number;
  musicUploadEnabled: boolean;
  name: string;
  participationMode: "group" | "individual";
}

export interface CompetitionDivisionFormValue {
  ageCategory?: { name: string };
  ageCategoryId: string;
  competitionId?: string;
  id: string;
}

export interface AgeCategoryOption {
  id: string;
  name: string;
}

export interface CompetitionCategoryOption {
  id: string;
  name: string;
  retiredAt: number | null;
}

function CompetitionForm({
  ageCategories,
  categories,
  competition,
  editionId,
  onOpenChange,
}: {
  ageCategories: readonly AgeCategoryOption[];
  categories: readonly CompetitionCategoryOption[];
  competition: CompetitionFormValue | null;
  editionId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const zero = useZero();
  const activeCategories = categories.filter(
    (category) =>
      category.retiredAt === null ||
      category.id === competition?.competitionCategoryId
  );
  const handleCancel = useEventCallback(() => onOpenChange(false));
  const activeAgeCategories = ageCategories;
  const form = useForm({
    defaultValues: {
      competitionCategoryId:
        competition?.competitionCategoryId || activeCategories[0]?.id || "",
      divisions:
        competition?.divisions.map((division) => ({ ...division })) ?? [],
      genderEligibility: competition
        ? competition.genderEligibility
        : ("both" as const),
      maximumGroupSize: competition ? competition.maximumGroupSize : 1,
      minimumGroupSize: competition ? competition.minimumGroupSize : 1,
      musicUploadEnabled: competition ? competition.musicUploadEnabled : false,
      name: competition ? competition.name : "",
      participationMode: competition
        ? competition.participationMode
        : ("individual" as const),
    },
    onSubmit: async ({ value }) => {
      const competitionId = competition ? competition.id : uuidv7();
      const common = {
        ...value,
        auditEntryId: uuidv7(),
        competitionId,
        divisions: value.divisions.map((division) => ({
          ageCategoryId: division.ageCategoryId,
          divisionId: division.id,
        })),
        now: Date.now(),
      };
      const result = competition
        ? await zero.mutate(
            mutators.kalakritiCompetition.updateCompetition(common)
          ).server
        : await zero.mutate(
            mutators.kalakritiCompetition.createCompetition({
              ...common,
              editionId,
            })
          ).server;
      handleMutationResult(result, {
        entityId: competitionId,
        errorMsg: competition
          ? "Failed to update Competition"
          : "Failed to create Competition",
        mutation: competition
          ? "kalakritiCompetition.updateCompetition"
          : "kalakritiCompetition.createCompetition",
        successMsg: competition ? "Competition updated" : "Competition created",
      });
      if (result.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: { onChange: competitionSchema, onSubmit: competitionSchema },
  });
  return (
    <FormLayout form={form}>
      <InputField autoFocus isRequired label="Competition name" name="name" />
      <SelectField
        isRequired
        label="Competition Category"
        name="competitionCategoryId"
        options={activeCategories.map((category) => ({
          label: category.name,
          value: category.id,
        }))}
      />
      <CustomField<CompetitionDivisionFormValue[]>
        description="Each selected Age Category is an independently ranked Competition Division."
        isRequired
        label="Age Categories"
        name="divisions"
      >
        {(field) => (
          <AgeCategoryDivisionPicker
            field={field}
            options={activeAgeCategories}
            submitted={form.state.submissionAttempts > 0}
          />
        )}
      </CustomField>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          isRequired
          label="Participation mode"
          name="participationMode"
          options={[
            { label: "Individual", value: "individual" },
            { label: "Group", value: "group" },
          ]}
        />
        <SelectField
          isRequired
          label="Gender eligibility"
          name="genderEligibility"
          options={[
            { label: "All Students", value: "both" },
            { label: "Male Students", value: "male" },
            { label: "Female Students", value: "female" },
          ]}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          description="Use 1 for an individual Competition."
          isRequired
          label="Minimum group size"
          name="minimumGroupSize"
          type="number"
        />
        <InputField
          description="Use 1 for an individual Competition."
          isRequired
          label="Maximum group size"
          name="maximumGroupSize"
          type="number"
        />
      </div>
      <CheckboxField
        description="Guardians can attach one optional audio file to each Entry."
        label="Allow music upload"
        name="musicUploadEnabled"
      />
      <FormActions
        onCancel={handleCancel}
        submitLabel={competition ? "Save Competition" : "Create Competition"}
        submittingLabel={competition ? "Saving..." : "Creating..."}
      />
    </FormLayout>
  );
}

function AgeCategoryDivisionPicker({
  field,
  options,
  submitted,
}: {
  field: FormFieldApi<CompetitionDivisionFormValue[]>;
  options: readonly AgeCategoryOption[];
  submitted: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const anchorRef = useComboboxAnchor();
  const optionMap = new Map(options.map((option) => [option.id, option]));
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) =>
        option.name.toLocaleLowerCase().includes(normalizedQuery)
      )
    : options;
  const handleValueChange = useEventCallback((ageCategoryIds: string[]) => {
    const existing = new Map(
      field.state.value.map((division) => [division.ageCategoryId, division])
    );
    field.handleChange(
      ageCategoryIds.map(
        (ageCategoryId) =>
          existing.get(ageCategoryId) ?? {
            ageCategoryId,
            id: uuidv7(),
          }
      )
    );
  });

  return (
    <Combobox
      filter={null}
      inputValue={searchQuery}
      multiple
      onInputValueChange={setSearchQuery}
      onValueChange={handleValueChange}
      value={field.state.value.map((division) => division.ageCategoryId)}
    >
      <ComboboxChips {...fieldErrorProps(field, submitted)} ref={anchorRef}>
        {field.state.value.map((division) => (
          <ComboboxChip key={division.id}>
            {optionMap.get(division.ageCategoryId)?.name ??
              division.ageCategoryId}
          </ComboboxChip>
        ))}
        <ComboboxChipsInput
          aria-required="true"
          id={field.name}
          onBlur={field.handleBlur}
          placeholder="Search Age Categories..."
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchorRef}>
        <ComboboxList>
          {filteredOptions.map((option) => (
            <ComboboxItem key={option.id} value={option.id}>
              {option.name}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export function CompetitionFormDialog({
  ageCategories,
  categories,
  competition,
  editionId,
  onOpenChange,
  open,
}: {
  ageCategories: readonly AgeCategoryOption[];
  categories: readonly CompetitionCategoryOption[];
  competition: CompetitionFormValue | null;
  editionId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [formKey, setFormKey] = useState(0);
  const handleOpenChange = useEventCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((key) => key + 1);
    }
    onOpenChange(nextOpen);
  });
  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {competition ? "Edit Competition" : "Add Competition"}
          </DialogTitle>
          <DialogDescription>
            Configure participation, eligibility, and group-size rules.
          </DialogDescription>
        </DialogHeader>
        <CompetitionForm
          ageCategories={ageCategories}
          categories={categories}
          competition={competition}
          editionId={editionId}
          key={formKey}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}
