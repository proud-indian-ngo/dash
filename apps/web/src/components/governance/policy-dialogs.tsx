import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  POLICY_AUDIENCE_LABELS,
  POLICY_SUMMARY_MAX,
  POLICY_TITLE_MAX,
  type PolicyAudience,
  policyAudienceValues,
} from "@pi-dash/shared/declarations";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";

import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { TextareaField } from "@/components/form/textarea-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

import { dateToIso, formatIso } from "./register-data";

const FUTURE_MONTH = new Date(2100, 11, 1);

const audienceOptions = policyAudienceValues.map((value) => ({
  label: POLICY_AUDIENCE_LABELS[value],
  value,
}));

const NO_DOCUMENT = "";

function NewPolicyForm({ onDone }: { onDone: () => void }) {
  const zero = useZero();
  const form = useForm({
    defaultValues: {
      audience: "everyone" as PolicyAudience,
      description: "",
      title: "",
    },
    onSubmit: async ({ value }) => {
      if (!value.title.trim()) {
        toast.error("Give the policy a title.");
        return;
      }
      const id = uuidv7();
      const result = await zero.mutate(
        mutators.policy.create({
          audience: value.audience,
          description: value.description.trim() || null,
          id,
          title: value.title.trim(),
        })
      ).server;
      handleMutationResult(result, {
        entityId: id,
        errorMsg: `Couldn't add the policy: ${getMutationResultErrorMessage(result.type === "error" ? result.error : undefined, "something went wrong")}`,
        mutation: "policy.create",
        successMsg: "Policy added. Publish its first version next.",
      });
      if (result.type !== "error") {
        onDone();
      }
    },
  });
  const cancel = useEventCallback(onDone);
  return (
    <FormLayout form={form}>
      <InputField
        isRequired
        label="Title"
        maxLength={POLICY_TITLE_MAX}
        name="title"
      />
      <SelectField label="For" name="audience" options={audienceOptions} />
      <TextareaField
        label="What it covers"
        maxLength={POLICY_SUMMARY_MAX}
        name="description"
        rows={3}
      />
      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel="Add policy"
        submittingLabel="Adding..."
      />
    </FormLayout>
  );
}

export function NewPolicyDialog({ onClose }: { onClose: () => void }) {
  const handleOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      onClose();
    }
  });
  return (
    <Dialog onOpenChange={handleOpenChange} open>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>New policy</DialogTitle>
          <DialogDescription>
            Name it and say who it's for; publish its approved version next.
          </DialogDescription>
        </DialogHeader>
        <NewPolicyForm onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function PublishForm({
  documents,
  onDone,
  policyId,
}: {
  documents: readonly { datedOn: string; id: string; title: string }[];
  onDone: () => void;
  policyId: string;
}) {
  const zero = useZero();
  const form = useForm({
    defaultValues: {
      documentId: NO_DOCUMENT,
      effectiveOn: new Date() as Date | undefined,
      summary: "",
    },
    onSubmit: async ({ value }) => {
      const effectiveOn = dateToIso(value.effectiveOn);
      if (!(value.documentId && effectiveOn)) {
        toast.error("Choose the approved document and the day it's in force.");
        return;
      }
      const id = uuidv7();
      const result = await zero.mutate(
        mutators.policy.publishVersion({
          documentId: value.documentId,
          effectiveOn,
          id,
          policyId,
          summary: value.summary.trim() || null,
        })
      ).server;
      handleMutationResult(result, {
        entityId: id,
        errorMsg: `Couldn't publish it: ${getMutationResultErrorMessage(result.type === "error" ? result.error : undefined, "something went wrong")}`,
        mutation: "policy.publishVersion",
        successMsg: "Version published",
      });
      if (result.type !== "error") {
        onDone();
      }
    },
  });
  const cancel = useEventCallback(onDone);
  return (
    <FormLayout form={form}>
      <SelectField
        description={
          documents.length === 0
            ? "Upload the approved policy on the Documents page, as a policy, first."
            : undefined
        }
        isRequired
        label="Approved document"
        name="documentId"
        options={[
          { label: "Choose a document", value: NO_DOCUMENT },
          ...documents.map((d) => ({
            label: `${d.title} · ${formatIso(d.datedOn)}`,
            value: d.id,
          })),
        ]}
      />
      <DateField
        endMonth={FUTURE_MONTH}
        isRequired
        label="In force from"
        name="effectiveOn"
      />
      <TextareaField
        label="What changed"
        maxLength={POLICY_SUMMARY_MAX}
        name="summary"
        rows={3}
      />
      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel="Publish version"
        submittingLabel="Publishing..."
      />
    </FormLayout>
  );
}

export function PublishDialog({
  documents,
  onClose,
  policyId,
}: {
  documents: readonly { datedOn: string; id: string; title: string }[];
  onClose: () => void;
  policyId: string;
}) {
  const handleOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      onClose();
    }
  });
  return (
    <Dialog onOpenChange={handleOpenChange} open>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>Publish a version</DialogTitle>
          <DialogDescription>
            Everyone it's for is asked to acknowledge the new version from the
            day it's in force.
          </DialogDescription>
        </DialogHeader>
        <PublishForm
          documents={documents}
          onDone={onClose}
          policyId={policyId}
        />
      </DialogContent>
    </Dialog>
  );
}
