import { useForm } from "@tanstack/react-form";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { TextareaField } from "@/components/form/textarea-field";
import type { GroupFormValues } from "./whatsapp-group-schema";
import { groupSchema } from "./whatsapp-group-schema";

export type { GroupFormValues } from "./whatsapp-group-schema";

export function GroupForm({
  initialValues,
  onCancel,
  onSubmit,
}: {
  initialValues: GroupFormValues;
  onCancel: () => void;
  onSubmit: (values: GroupFormValues) => void | Promise<void>;
}) {
  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    validators: {
      onChange: groupSchema,
      onSubmit: groupSchema,
    },
  });

  return (
    <FormLayout form={form}>
      <div className="flex flex-col gap-3 py-2">
        <InputField isRequired label="Name" name="name" />
        <InputField
          description="The WhatsApp group JID (e.g. 120363012345678901@g.us). Found in the group invite link or WhatsApp API."
          isRequired
          label="JID"
          name="jid"
          placeholder="120363012345678901@g.us"
        />
        <TextareaField label="Description" name="description" />
        <FormActions
          onCancel={onCancel}
          submitLabel="Save"
          submittingLabel="Saving..."
        />
      </div>
    </FormLayout>
  );
}
