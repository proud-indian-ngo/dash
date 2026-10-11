import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  EVENT_PARTNER_LINKEDIN_MAX_LENGTH,
  EVENT_PARTNER_NAME_MAX_LENGTH,
  EVENT_PARTNERS_MAX,
  INSTAGRAM_HANDLE_RE,
} from "@pi-dash/shared/social-recap";
import { uuidv7 } from "uuidv7";
import z from "zod";

import type { FormInstance } from "@/components/form/form-context";
import { useResolvedForm } from "@/components/form/form-context";
import { InputField } from "@/components/form/input-field";

export const partnerFormSchema = z.object({
  instagram: z
    .string()
    .trim()
    .regex(INSTAGRAM_HANDLE_RE, "Use an Instagram handle like @name")
    .or(z.literal("")),
  /** Stable React key for the row; never sent to the server. */
  key: z.string(),
  linkedin: z.string().trim().max(EVENT_PARTNER_LINKEDIN_MAX_LENGTH),
  name: z
    .string()
    .trim()
    .min(1, "Partner name is required")
    .max(EVENT_PARTNER_NAME_MAX_LENGTH),
});

export const partnersFormSchema = z
  .array(partnerFormSchema)
  .max(EVENT_PARTNERS_MAX, `At most ${EVENT_PARTNERS_MAX} partners`);

export type PartnerFormValue = z.infer<typeof partnerFormSchema>;

export function toPartnerFormValues(
  partners:
    | readonly {
        instagram?: string | null;
        linkedin?: string | null;
        name: string;
      }[]
    | undefined
): PartnerFormValue[] {
  return (partners ?? []).map((partner) => ({
    instagram: partner.instagram ?? "",
    key: uuidv7(),
    linkedin: partner.linkedin ?? "",
    name: partner.name,
  }));
}

/** Mutator payload: fresh ids each save, so a new exception or series never reuses the source row's ids. */
export function toPartnerMutatorArgs(partners: readonly PartnerFormValue[]) {
  return partners.map((partner) => ({
    id: uuidv7(),
    instagram: partner.instagram.trim() || null,
    linkedin: partner.linkedin.trim() || null,
    name: partner.name.trim(),
  }));
}

interface ArrayFieldApi {
  pushValue: (value: PartnerFormValue) => void;
  removeValue: (index: number) => void;
  state: { value: PartnerFormValue[] };
}

function PartnerRow({
  index,
  name,
  onRemove,
}: {
  index: number;
  name: string;
  onRemove: (index: number) => void;
}) {
  const handleRemove = useEventCallback(() => onRemove(index));
  return (
    <div className="grid items-start gap-2 sm:grid-cols-[1.4fr_1fr_1fr_32px]">
      <InputField
        hideLabel
        isRequired
        label={`Partner ${index + 1} name`}
        name={`${name}[${index}].name`}
        placeholder="Partner name"
      />
      <InputField
        hideLabel
        label={`Partner ${index + 1} Instagram`}
        name={`${name}[${index}].instagram`}
        placeholder="@instagram"
      />
      <InputField
        hideLabel
        label={`Partner ${index + 1} LinkedIn`}
        name={`${name}[${index}].linkedin`}
        placeholder="LinkedIn page"
      />
      <Button
        aria-label={`Remove partner ${index + 1}`}
        className="max-sm:justify-self-end"
        onClick={handleRemove}
        size="icon"
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon className="size-4" icon={Delete02Icon} strokeWidth={2} />
      </Button>
    </div>
  );
}

/** Repeater for the organisations credited on the event's social posts. */
export function EventPartnersField({
  form: formProp,
  name = "partners",
}: {
  form?: FormInstance;
  name?: string;
}) {
  const form = useResolvedForm(formProp, "EventPartnersField");
  return (
    <form.Field mode="array" name={name}>
      {(rawField: unknown) => {
        const arrayField = rawField as ArrayFieldApi;
        const partners = arrayField.state.value;
        return (
          <div className="flex flex-col gap-2">
            <Label>Partners</Label>
            {partners.map((partner, index) => (
              <PartnerRow
                index={index}
                key={partner.key}
                name={name}
                onRemove={arrayField.removeValue}
              />
            ))}
            {partners.length < EVENT_PARTNERS_MAX ? (
              <Button
                className="self-start"
                onClick={() =>
                  arrayField.pushValue({
                    instagram: "",
                    key: uuidv7(),
                    linkedin: "",
                    name: "",
                  })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <HugeiconsIcon
                  className="size-3.5"
                  icon={PlusSignIcon}
                  strokeWidth={2}
                />
                Add partner
              </Button>
            ) : null}
            <p className="text-muted-foreground text-xs">
              Credited on Instagram and LinkedIn posts. Up to{" "}
              {EVENT_PARTNERS_MAX}.
            </p>
          </div>
        );
      }}
    </form.Field>
  );
}
