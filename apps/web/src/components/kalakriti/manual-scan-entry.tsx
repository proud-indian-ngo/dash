import { FormActions } from "@/components/form/form-actions";
import type { FormInstance } from "@/components/form/form-context";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Yearly IDs are stored upper case and record IDs lower case, while the server
 * matches exactly. Phone keyboards capitalise and autocorrect freely, so fold
 * typed IDs to the stored case before they leave the client.
 */
export function normalizeManualScanId(value: string) {
  const id = value.trim();
  return UUID_PATTERN.test(id) ? id.toLowerCase() : id.toUpperCase();
}

/**
 * The typed-ID fallback under the camera: always open, one row, so an operator
 * whose camera fails or whose card is damaged never hunts for it.
 */
export function ManualScanEntry({
  disabled,
  form,
  label,
  placeholder,
  submitLabel,
  submittingLabel,
}: {
  disabled: boolean;
  form: FormInstance;
  label: string;
  placeholder: string;
  submitLabel: string;
  submittingLabel?: string;
}) {
  return (
    <FormLayout aria-label="Enter ID manually" form={form}>
      <fieldset className="flex items-end gap-2" disabled={disabled}>
        <div className="min-w-0 flex-1">
          <InputField
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="go"
            isRequired
            label={label}
            name="humanId"
            placeholder={placeholder}
            spellCheck={false}
          />
        </div>
        <FormActions
          // Scan panels sit at the screen edge where toasts appear;
          // keep the action left so a toast never covers the next scan.
          className="shrink-0 justify-start"
          disabled={disabled}
          submitLabel={submitLabel}
          submittingLabel={submittingLabel}
        />
      </fieldset>
    </FormLayout>
  );
}
