import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  MAX_VOLUNTEER_HOUR_VALUE_PAISE,
  parseVolunteerHourValue,
  VOLUNTEER_HOUR_VALUE_CONFIG_KEY,
  VOLUNTEER_HOUR_VALUE_RANGE_MESSAGE,
} from "@pi-dash/shared/outcomes";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SettingsCard, SettingsRow } from "@/components/settings/settings-ui";
import {
  formatPaiseCompact,
  isValidRupeesInput,
  optionalRupeesToPaise,
  paiseToRupeesInput,
} from "@/lib/paise";
import { reportMutationResult } from "@/lib/report-mutation-result";

const HELP =
  "Used to value volunteer time in Analytics. Never posted to the books.";

const hourValueSchema = z.object({
  value: z
    .string()
    .refine(isValidRupeesInput, "Enter a rupee amount up to two decimals")
    .refine((v) => {
      const paise = isValidRupeesInput(v) ? optionalRupeesToPaise(v) : null;
      return (
        paise === null ||
        (paise >= 1 && paise <= MAX_VOLUNTEER_HOUR_VALUE_PAISE)
      );
    }, VOLUNTEER_HOUR_VALUE_RANGE_MESSAGE),
});

function HourValueForm({
  initialValue,
  onCancel,
  onSubmit,
}: {
  initialValue: string;
  onCancel: () => void;
  onSubmit: (value: string) => void | Promise<void>;
}) {
  const form = useForm({
    defaultValues: { value: initialValue },
    onSubmit: async ({ value }) => {
      await onSubmit(value.value);
    },
    validators: { onChange: hourValueSchema, onSubmit: hourValueSchema },
  });
  return (
    <FormLayout form={form}>
      <div className="flex flex-col gap-3 py-2">
        <InputField
          description={`${HELP} Leave empty to clear it.`}
          inputMode="decimal"
          label="Value of a volunteer hour (₹)"
          name="value"
        />
        <FormActions
          onCancel={onCancel}
          submitLabel="Save value"
          submittingLabel="Saving..."
        />
      </div>
    </FormLayout>
  );
}

/**
 * Settings → Programmes → Volunteer time: the org-wide value of one volunteer
 * hour, in `app_config`. Blank means not set; Analytics then asks for it.
 */
export function VolunteerHourValueCard() {
  const zero = useZero();
  const [configs] = useQuery(queries.appConfig.all());
  const valuePaise = parseVolunteerHourValue(
    configs?.find((c) => c.key === VOLUNTEER_HOUR_VALUE_CONFIG_KEY)?.value
  );
  const [editing, setEditing] = useState(false);
  const openEdit = useEventCallback(() => setEditing(true));
  const cancel = useEventCallback(() => setEditing(false));

  const handleSubmit = useEventCallback(async (value: string) => {
    const paise = optionalRupeesToPaise(value);
    const res = await zero.mutate(
      paise === null
        ? mutators.appConfig.remove({ key: VOLUNTEER_HOUR_VALUE_CONFIG_KEY })
        : mutators.appConfig.upsert({
            key: VOLUNTEER_HOUR_VALUE_CONFIG_KEY,
            value: String(paise),
          })
    ).server;
    reportMutationResult(res, {
      entityId: VOLUNTEER_HOUR_VALUE_CONFIG_KEY,
      errorMsg: "Failed to update the hourly value",
      mutation: paise === null ? "appConfig.remove" : "appConfig.upsert",
      successMsg:
        paise === null ? "Hourly value cleared" : "Hourly value updated",
    });
    if (res.type !== "error") {
      setEditing(false);
    }
  });

  return (
    <SettingsCard title="Volunteer time">
      {editing ? (
        <div className="bg-muted/30 px-4 py-3">
          <HourValueForm
            initialValue={paiseToRupeesInput(valuePaise)}
            onCancel={cancel}
            onSubmit={handleSubmit}
          />
        </div>
      ) : (
        <SettingsRow
          description={HELP}
          title={
            valuePaise === null
              ? "Hourly value: not set"
              : `Hourly value: ${formatPaiseCompact(valuePaise)}`
          }
        >
          <Button
            aria-label="Edit volunteer hour value"
            onClick={openEdit}
            size="sm"
            type="button"
            variant="outline"
          >
            Edit
          </Button>
        </SettingsRow>
      )}
    </SettingsCard>
  );
}
