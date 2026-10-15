import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  CASH_VOUCHER_CAP_NOTE,
  CASH_VOUCHER_LIMIT_CONFIG_KEY,
  CASH_VOUCHER_LIMIT_RANGE_MESSAGE,
  formatCashVoucherLimit,
  isValidCashVoucherLimitPaise,
} from "@pi-dash/shared/cash-voucher";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SettingsCard, SettingsRow } from "@/components/settings/settings-ui";
import { useCashVoucherLimit } from "@/hooks/use-cash-voucher-limit";
import {
  isValidRupeesInput,
  optionalRupeesToPaise,
  paiseToRupeesInput,
} from "@/lib/paise";
import { reportMutationResult } from "@/lib/report-mutation-result";

const cashVoucherLimitSchema = z.object({
  limit: z
    .string()
    .refine((v) => v.trim() !== "", "Enter an amount")
    .refine(isValidRupeesInput, "Enter a rupee amount up to two decimals")
    .refine((v) => {
      const paise = isValidRupeesInput(v) ? optionalRupeesToPaise(v) : null;
      return paise === null || isValidCashVoucherLimitPaise(paise);
    }, CASH_VOUCHER_LIMIT_RANGE_MESSAGE),
});

function CashVoucherLimitForm({
  initialValue,
  onCancel,
  onSubmit,
}: {
  initialValue: string;
  onCancel: () => void;
  onSubmit: (limit: string) => void | Promise<void>;
}) {
  const form = useForm({
    defaultValues: { limit: initialValue },
    onSubmit: async ({ value }) => {
      await onSubmit(value.limit);
    },
    validators: {
      onChange: cashVoucherLimitSchema,
      onSubmit: cashVoucherLimitSchema,
    },
  });
  return (
    <FormLayout form={form}>
      <div className="flex flex-col gap-3 py-2">
        <InputField
          description={`Between ₹1 and ₹10,000. ${CASH_VOUCHER_CAP_NOTE}`}
          inputMode="decimal"
          isRequired
          label="Cash voucher limit (₹)"
          name="limit"
        />
        <FormActions
          onCancel={onCancel}
          submitLabel="Save limit"
          submittingLabel="Saving..."
        />
      </div>
    </FormLayout>
  );
}

/**
 * Settings → Programmes → Cash vouchers: the largest line item a cash voucher
 * may stand in for. Kept in `app_config`; finance.manage edits it and the
 * server refuses anything outside ₹1 to ₹10,000.
 */
export function CashVoucherLimitCard() {
  const zero = useZero();
  const limitPaise = useCashVoucherLimit();
  const [editing, setEditing] = useState(false);
  const openEdit = useEventCallback(() => setEditing(true));
  const cancel = useEventCallback(() => setEditing(false));

  const handleSubmit = useEventCallback(async (limit: string) => {
    const paise = optionalRupeesToPaise(limit);
    if (paise === null) {
      return;
    }
    const res = await zero.mutate(
      mutators.appConfig.upsert({
        key: CASH_VOUCHER_LIMIT_CONFIG_KEY,
        value: String(paise),
      })
    ).server;
    reportMutationResult(res, {
      entityId: CASH_VOUCHER_LIMIT_CONFIG_KEY,
      errorMsg: "Failed to update the voucher limit",
      mutation: "appConfig.upsert",
      successMsg: "Voucher limit updated",
    });
    if (res.type !== "error") {
      setEditing(false);
    }
  });

  return (
    <SettingsCard title="Cash vouchers">
      {editing ? (
        <div className="bg-muted/30 px-4 py-3">
          <CashVoucherLimitForm
            initialValue={paiseToRupeesInput(limitPaise)}
            onCancel={cancel}
            onSubmit={handleSubmit}
          />
        </div>
      ) : (
        <SettingsRow
          description="Line items without a bill up to this amount can get a cash voucher, for example a daily-wage labourer paid in cash. Vouchers already made stay valid when you lower it."
          title={`Limit: ${formatCashVoucherLimit(limitPaise)}`}
        >
          <Button
            aria-label="Edit cash voucher limit"
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
