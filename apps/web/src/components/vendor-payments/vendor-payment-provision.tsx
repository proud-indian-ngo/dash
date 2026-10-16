import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@pi-dash/design-system/components/ui/combobox";
import { FieldDescription } from "@pi-dash/design-system/components/ui/field";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { formatPaise } from "@pi-dash/shared/money";
import {
  PROVISION_HEADS,
  provisionHeadOf,
  provisionOutstandingText,
} from "@pi-dash/shared/provisions";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";

import { useApp } from "@/context/app-context";
import {
  getVendorPaymentProvision,
  type VendorPaymentProvision,
} from "@/functions/vendor-payment-provision";

import type { VendorPaymentWithRelations } from "./vendor-payment-types";

/**
 * An auditor's invoice clearing the audit fee provision. At invoice
 * approval finance picks, per line, its category's expense or a provision
 * (`PROVISION_HEADS`); the picker says what is outstanding of it. Once the
 * books post the invoice, the Invoice section shows how each such line was
 * split: cleared from the provision, and the rest as expense.
 */

type Line = VendorPaymentWithRelations["lineItems"][number];

/** Who may see the provision and the split (as the server function admits). */
export function useCanSeeProvision(): boolean {
  const { hasPermission } = useApp();
  return (
    hasPermission("requests.approve") ||
    hasPermission("finance.view") ||
    hasPermission("finance.manage")
  );
}

/** Loads the provision view while `enabled`, again when `version` changes. */
export function useVendorPaymentProvision(
  vendorPaymentId: string,
  enabled: boolean,
  version: unknown
): VendorPaymentProvision | null {
  const load = useServerFn(getVendorPaymentProvision);
  const [view, setView] = useState<VendorPaymentProvision | null>(null);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    load({ data: { vendorPaymentId } })
      .then((result) => {
        if (!cancelled) {
          setView(result);
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "vendorPayment.loadProvision",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "useVendorPaymentProvision",
          vendorPaymentId,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, load, vendorPaymentId, version]);
  return enabled ? view : null;
}

/** What each line is charged to: "" for its category, else a provision head. */
export type LineCharges = Record<string, string>;

/** The lines' current choice, for opening the picker. */
export const lineChargesOf = (lines: readonly Line[]): LineCharges =>
  Object.fromEntries(lines.map((l) => [l.id, l.provisionHeadId ?? ""]));

/** The approval's arguments: one provision head and the lines charged to it. */
export function provisionArgs(charges: LineCharges): {
  provisionHeadId?: string;
  provisionLineIds?: string[];
} {
  const chosen = Object.entries(charges).filter(([, head]) => head !== "");
  const [first] = chosen;
  if (!first) {
    return {};
  }
  return {
    provisionHeadId: first[1],
    provisionLineIds: chosen
      .filter(([, head]) => head === first[1])
      .map(([lineId]) => lineId),
  };
}

const CATEGORY = "category";

function LineChargePicker({
  line,
  onChange,
  outstanding,
  value,
}: {
  line: Line;
  onChange: (lineId: string, head: string) => void;
  outstanding: VendorPaymentProvision["outstanding"] | undefined;
  value: string;
}) {
  const categoryLabel = `${line.category?.name ?? "Its category"} (expense)`;
  const labels = new Map<string, string>([
    [CATEGORY, categoryLabel],
    ...PROVISION_HEADS.map((h) => [h.id, h.label] as [string, string]),
  ]);
  const items = [...labels.keys()];
  const itemToStringLabel = useEventCallback(
    (item: string) => labels.get(item) ?? item
  );
  const handleChange = useEventCallback((item: string | null) =>
    onChange(line.id, item && item !== CATEGORY ? item : "")
  );
  const id = `charge-${line.id}`;
  const provision = provisionHeadOf(value);
  const left = provision
    ? outstanding?.find((o) => o.headId === provision.id)
    : undefined;
  const description = line.description?.trim() || line.category?.name;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        Charge to
        <span className="text-muted-foreground font-normal">
          {" "}
          · {description} · {formatPaise(line.amountPaise)}
        </span>
      </Label>
      <Combobox
        items={items}
        itemToStringLabel={itemToStringLabel}
        onValueChange={handleChange}
        value={value || CATEGORY}
      >
        <ComboboxInput className="w-full" id={id} placeholder="Search..." />
        <ComboboxContent>
          <ComboboxList>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                {labels.get(item) ?? item}
              </ComboboxItem>
            )}
          </ComboboxList>
          <ComboboxEmpty>No matches.</ComboboxEmpty>
        </ComboboxContent>
      </Combobox>
      {provision ? (
        <FieldDescription data-testid="provision-outstanding">
          {left
            ? `${provisionOutstandingText(left)}. The payment clears up to that; anything above it is ${provision.excessLabel.toLowerCase()}.`
            : "Checking what is outstanding…"}
        </FieldDescription>
      ) : null}
    </div>
  );
}

/**
 * The approval dialog's picker: each line of the invoice, charged to its
 * category's expense (the default) or to a provision.
 */
export function ProvisionChargePicker({
  charges,
  lines,
  onChange,
  outstanding,
}: {
  charges: LineCharges;
  lines: readonly Line[];
  onChange: (lineId: string, head: string) => void;
  outstanding: VendorPaymentProvision["outstanding"] | undefined;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="provision-picker">
      {lines.map((line) => (
        <LineChargePicker
          key={line.id}
          line={line}
          onChange={onChange}
          outstanding={outstanding}
          value={charges[line.id] ?? ""}
        />
      ))}
    </div>
  );
}

/**
 * How the books split the invoice's lines charged to a provision, shown
 * under the invoice once it is accepted; "not posted yet" before.
 */
export function ProvisionSplit({
  lines,
  split,
}: {
  lines: readonly Line[];
  split: VendorPaymentProvision["split"] | undefined;
}) {
  const charged = lines.filter((l) => provisionHeadOf(l.provisionHeadId));
  if (charged.length === 0) {
    return null;
  }
  return (
    <div
      className="bg-muted/40 flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm"
      data-testid="provision-split"
    >
      {charged.map((line) => {
        const provision = provisionHeadOf(line.provisionHeadId);
        const posted = split?.find((s) => s.lineId === line.id);
        const name = line.description?.trim() || line.category?.name;
        if (!(provision && posted)) {
          return (
            <p className="text-muted-foreground" key={line.id}>
              {name}: charged to {provision?.label}; the books split it once the
              invoice posts.
            </p>
          );
        }
        return (
          <p key={line.id}>
            <span className="font-medium">{name}</span>
            <span className="text-muted-foreground">: </span>
            <span className="tabular-nums">
              {formatPaise(posted.clearedPaise)}
            </span>{" "}
            cleared from {provision.name}
            {posted.expensePaise > 0 ? (
              <>
                {" · "}
                <span className="tabular-nums">
                  {formatPaise(posted.expensePaise)}
                </span>{" "}
                as {provision.excessLabel.toLowerCase()}
              </>
            ) : null}
          </p>
        );
      })}
    </div>
  );
}
