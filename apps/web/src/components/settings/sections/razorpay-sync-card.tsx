import { RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { currentFinancialYear, todayInKolkata } from "@pi-dash/shared/income";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { SettingsCard, SettingsRow } from "@/components/settings/settings-ui";
import {
  importPastRazorpayPayments,
  syncRazorpayNow,
} from "@/functions/razorpay-settings";
import { localDateToIso } from "@/lib/local-date";
import type { RazorpaySettingsView } from "@/lib/razorpay/settings";

type ReconcileView = RazorpaySettingsView["reconcile"];
type Run = NonNullable<ReconcileView["last"]>;

/** The longest range "Import past payments" takes; the server checks it too. */
const MAX_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

const formatWhen = (iso: string | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
      })
    : "";

/** "14 Oct, 10:05 · 12 payments checked · 1 new · 0 errors", or a failure line. */
export function lastSyncLine(last: Run | null): string {
  if (!last) {
    return "Never";
  }
  const when = formatWhen(last.finishedAt ?? last.updatedAt);
  if (last.status === "failed") {
    return `${when} · Couldn't finish; it runs again on its own`;
  }
  const parts = [when];
  if (last.listed) {
    parts.push(
      count(last.counts.checked, "payment checked", "payments checked"),
      `${last.counts.new.toLocaleString("en-IN")} new`
    );
  }
  if (last.counts.retried > 0 || !last.listed) {
    parts.push(
      count(
        last.counts.retried,
        "stuck payment retried",
        "stuck payments retried"
      )
    );
  }
  if (last.counts.refundsApplied > 0) {
    parts.push(count(last.counts.refundsApplied, "refund", "refunds"));
  }
  if (last.counts.settlementsFound > 0) {
    parts.push(
      `${count(last.counts.settlementsFound, "settlement", "settlements")} (${last.counts.settlementsNew.toLocaleString("en-IN")} new)`
    );
  }
  parts.push(count(last.counts.errors, "error", "errors"));
  return parts.join(" · ");
}

/** "Syncing… 3 of 400 days", or "Waiting to start…" until the job picks it up. */
export function activeLine(active: Run): string {
  if (active.status === "queued") {
    return "Waiting to start…";
  }
  return active.windowsTotal > 1
    ? `Syncing… ${active.windowsDone.toLocaleString("en-IN")} of ${count(active.windowsTotal, "day", "days")}`
    : "Syncing…";
}

/** India's today as a local date for the picker, whatever the browser's timezone. */
const indiaToday = () => isoToLocalDate(todayInKolkata());

const isoToLocalDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
};

const rangeSchema = z
  .object({
    from: z
      .date()
      .optional()
      .refine((value) => value !== undefined, "Pick the first day"),
    to: z
      .date()
      .optional()
      .refine((value) => value !== undefined, "Pick the last day"),
  })
  .refine((v) => !(v.from && v.to) || v.from <= v.to, {
    message: "From must be on or before To",
    path: ["to"],
  })
  .refine(
    (v) =>
      !(v.from && v.to) ||
      Math.round((v.to.getTime() - v.from.getTime()) / DAY_MS) + 1 <= MAX_DAYS,
    { message: `Import at most ${MAX_DAYS} days at a time`, path: ["to"] }
  );

function ImportPastForm({
  disabled,
  onQueued,
}: {
  disabled: boolean;
  onQueued: () => void;
}) {
  const importPast = useServerFn(importPastRazorpayPayments);
  const today = indiaToday();
  const form = useForm({
    defaultValues: {
      from: isoToLocalDate(currentFinancialYear().startsOn),
      to: today,
    } as z.input<typeof rangeSchema>,
    onSubmit: async ({ value }) => {
      try {
        const result = await importPast({
          data: {
            from: localDateToIso(value.from) ?? "",
            to: localDateToIso(value.to) ?? "",
          },
        });
        toast.success("Importing past payments", {
          description: `${count(result.days, "day", "days")} from Razorpay, one day at a time.`,
        });
        onQueued();
      } catch (error) {
        log.error({
          action: "importPastRazorpayPayments",
          component: "RazorpaySyncCard",
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error("Couldn't start the import", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    validators: { onSubmit: rangeSchema },
  });
  return (
    <FormLayout form={form}>
      <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
        <DateField
          disabled={disabled}
          isRequired
          label="From"
          maxDate={today}
          name="from"
          startMonth={new Date(2015, 0, 1)}
        />
        <DateField
          disabled={disabled}
          isRequired
          label="To"
          maxDate={today}
          name="to"
          startMonth={new Date(2015, 0, 1)}
        />
      </div>
      <div className="px-4 pb-3">
        <FormActions
          disabled={disabled}
          submitLabel="Import past payments"
          submittingLabel="Starting..."
        />
      </div>
    </FormLayout>
  );
}

/**
 * Settings → Integrations: "Sync now" and "Import past payments", with the
 * run in progress (as pg-boss holds it) or the last result. Both need
 * finance.manage. Without the key secret, Sync now only retries payments
 * stuck in the queue, and Import past payments stays visible but off, with
 * the reason.
 */
export function RazorpaySyncCard({
  canManage,
  onChanged,
  reconcile,
}: {
  canManage: boolean;
  onChanged: () => void;
  reconcile: ReconcileView;
}) {
  const syncNow = useServerFn(syncRazorpayNow);
  const [starting, setStarting] = useState(false);
  const busy = starting || reconcile.active !== null;
  const syncOff = reconcile.syncUnavailableReason !== null;
  const backfillOff = reconcile.backfillUnavailableReason !== null;

  const handleSync = useEventCallback(async () => {
    setStarting(true);
    try {
      await syncNow();
      toast.success("Syncing with Razorpay");
      onChanged();
    } catch (error) {
      log.error({
        action: "syncRazorpayNow",
        component: "RazorpaySyncCard",
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Couldn't start the sync", {
        description: error instanceof Error ? error.message : undefined,
      });
      // Another run may be holding the queue: show it.
      onChanged();
    } finally {
      setStarting(false);
    }
  });

  const unavailable =
    reconcile.syncUnavailableReason ?? reconcile.backfillUnavailableReason;
  return (
    <SettingsCard
      description="Catches payments and refunds whose webhooks were missed, records settlements, and retries payments stuck in the queue. It also runs on its own every 6 hours over the last 3 days."
      title="Sync with Razorpay"
    >
      {unavailable ? (
        <p
          className="text-muted-foreground px-4 py-3 text-sm"
          data-testid="razorpay-sync-unavailable"
        >
          {unavailable}
        </p>
      ) : null}
      <SettingsRow title={reconcile.active ? "Sync" : "Last sync"}>
        <span className="text-sm tabular-nums" data-testid="razorpay-last-sync">
          {reconcile.active
            ? activeLine(reconcile.active)
            : lastSyncLine(reconcile.last)}
        </span>
      </SettingsRow>
      {canManage ? (
        <>
          <SettingsRow
            description={
              reconcile.listsFromApi
                ? "Checks today and the 3 days before."
                : "Retries payments stuck in the queue; without the key secret it can't list payments from Razorpay."
            }
            title="Sync now"
          >
            <Button
              disabled={syncOff || busy}
              onClick={handleSync}
              type="button"
              variant="outline"
            >
              <HugeiconsIcon
                className="size-4"
                icon={RefreshIcon}
                strokeWidth={2}
              />
              {busy ? "Syncing…" : "Sync now"}
            </Button>
          </SettingsRow>
          <div className="pt-3">
            <div className="px-4">
              <p className="text-sm font-medium">Import past payments</p>
              <p className="text-muted-foreground text-sm">
                Records Payment Page donations made before the webhook was set
                up, and the settlements that paid them out, up to {MAX_DAYS}{" "}
                days at a time. Payments already recorded are left as they are.
              </p>
            </div>
            <ImportPastForm
              disabled={backfillOff || busy}
              onQueued={onChanged}
            />
          </div>
        </>
      ) : null}
    </SettingsCard>
  );
}
