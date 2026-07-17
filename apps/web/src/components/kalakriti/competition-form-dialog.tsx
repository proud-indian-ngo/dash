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
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { handleMutationResult } from "@/lib/mutation-result";

const competitionSchema = z
  .object({
    competitionCategoryId: z.string().min(1, "Select a Category"),
    genderEligibility: z.enum(["male", "female", "both"]),
    maximumGroupSize: z.number().int().min(1).max(100),
    minimumGroupSize: z.number().int().min(1).max(100),
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
  genderEligibility: "both" | "female" | "male";
  id: string;
  maximumGroupSize: number;
  minimumGroupSize: number;
  name: string;
  participationMode: "group" | "individual";
}

export interface CompetitionCategoryOption {
  id: string;
  name: string;
  retiredAt: number | null;
}

function CompetitionForm({
  categories,
  competition,
  editionId,
  onOpenChange,
}: {
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
  const form = useForm({
    defaultValues: {
      competitionCategoryId:
        competition?.competitionCategoryId || activeCategories[0]?.id || "",
      genderEligibility: competition
        ? competition.genderEligibility
        : ("both" as const),
      maximumGroupSize: competition ? competition.maximumGroupSize : 1,
      minimumGroupSize: competition ? competition.minimumGroupSize : 1,
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
      <FormActions
        onCancel={handleCancel}
        submitLabel={competition ? "Save Competition" : "Create Competition"}
        submittingLabel={competition ? "Saving..." : "Creating..."}
      />
    </FormLayout>
  );
}

export function CompetitionFormDialog({
  categories,
  competition,
  editionId,
  onOpenChange,
  open,
}: {
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
