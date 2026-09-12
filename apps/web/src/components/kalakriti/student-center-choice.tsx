import { useForm } from "@tanstack/react-form";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { SelectField } from "@/components/form/select-field";

const schema = z.object({ centerId: z.string().min(1, "Choose a Center") });
export function StudentCenterChoice({
  centers,
  onChoose,
  onCancel,
}: {
  centers: readonly { id: string; name: string }[];
  onChoose: (id: string) => void;
  onCancel: () => void;
}) {
  const form = useForm({
    defaultValues: { centerId: "" },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: ({ value }) => {
      if (centers.some((center) => center.id === value.centerId))
        onChoose(value.centerId);
    },
  });
  return (
    <FormLayout form={form}>
      <SelectField
        isRequired
        label="Center"
        name="centerId"
        options={centers.map((center) => ({
          label: center.name,
          value: center.id,
        }))}
        placeholder="Choose Center"
      />
      {centers.length === 0 ? (
        <p role="status">No writable Centers are currently available.</p>
      ) : null}
      <FormActions
        disabled={centers.length === 0}
        onCancel={onCancel}
        submitLabel="Continue"
        submittingLabel="Continuing..."
      />
    </FormLayout>
  );
}
