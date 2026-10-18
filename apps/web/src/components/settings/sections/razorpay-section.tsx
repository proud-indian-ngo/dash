import { Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { ComboboxField } from "@/components/form/combobox-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { RazorpaySyncCard } from "@/components/settings/sections/razorpay-sync-card";
import { SettingsCard, SettingsRow } from "@/components/settings/settings-ui";
import { useApp } from "@/context/app-context";
import {
  getRazorpaySettings,
  updateRazorpaySettings,
} from "@/functions/razorpay-settings";
import {
  NOTES_FIELD_LABELS,
  NOTES_FIELDS,
  type NotesKeys,
  splitNotesKeys,
} from "@/lib/razorpay/notes-keys";
import type { RazorpaySettingsView } from "@/lib/razorpay/settings";

const formSchema = z.object({
  address: z.string(),
  city: z.string(),
  // Optional: the notes keys can be saved before an account is chosen.
  clearingAccountId: z.string().optional(),
  name: z.string(),
  pan: z.string(),
  pincode: z.string(),
  state: z.string(),
});
type FormValues = z.input<typeof formSchema>;

const plural = (n: number) =>
  `${n.toLocaleString("en-IN")} ${n === 1 ? "payment is" : "payments are"}`;

const formatTime = (epoch: number) =>
  new Date(epoch).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const formatDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });

/** "Last 16 Oct 2026 · synced 17 Oct, 10:05", "None yet" or "Off". */
export function settlementsLine(
  settlements: RazorpaySettingsView["settlements"]
): string {
  if (settlements.unavailableReason) {
    return "Off";
  }
  if (!settlements.lastSettledOn) {
    return "None yet";
  }
  const synced = settlements.lastSyncedAt
    ? ` · synced ${new Date(settlements.lastSyncedAt).toLocaleString("en-IN", {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
      })}`
    : "";
  return `Last ${formatDay(settlements.lastSettledOn)}${synced}`;
}

function settlementsDescription(
  settlements: RazorpaySettingsView["settlements"]
): string {
  if (settlements.unavailableReason) {
    return settlements.unavailableReason;
  }
  const waiting =
    settlements.unlinked > 0
      ? ` ${settlements.unlinked === 1 ? "1 payment or refund it covered is" : `${settlements.unlinked.toLocaleString("en-IN")} payments or refunds they covered are`} not imported yet; each is linked when it is.`
      : "";
  return `Payouts to the bank, recorded by each sync and when Razorpay announces one. See them under Income → Settlements.${waiting}`;
}

/** Why refunds need a look; each count is shown only when it is not zero. */
function attentionText(attention: RazorpaySettingsView["refundAttention"]) {
  const lines: string[] = [];
  if (attention.afterReceipt > 0) {
    lines.push(
      `${attention.afterReceipt === 1 ? "A refund was" : `${attention.afterReceipt.toLocaleString("en-IN")} refunds were`} made after the gift was receipted; the receipt was left as it is.`
    );
  }
  if (attention.amountChanged > 0) {
    lines.push(
      `Razorpay reported ${attention.amountChanged === 1 ? "a refund" : `${attention.amountChanged.toLocaleString("en-IN")} refunds`} again with a different amount; the first amount was kept.`
    );
  }
  return lines.join(" ");
}

function Banner({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "danger" | "warning";
}) {
  return (
    <div
      className={
        tone === "danger"
          ? "border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
          : "border-warning/30 bg-warning/10 text-warning-foreground dark:bg-warning-foreground/10 rounded-md border p-3 text-sm"
      }
      role="alert"
    >
      {children}
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const handleCopy = useEventCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it manually.");
    }
  });
  return (
    <div className="flex w-full gap-2 sm:w-96">
      <Input
        aria-label={label}
        className="font-mono text-xs"
        onFocus={(event) => event.target.select()}
        readOnly
        value={value}
      />
      <Button onClick={handleCopy} type="button" variant="outline">
        <HugeiconsIcon className="size-4" icon={Copy01Icon} strokeWidth={2} />
        Copy
      </Button>
    </div>
  );
}

function SettingsForm({
  canManage,
  onSaved,
  view,
}: {
  canManage: boolean;
  onSaved: () => void;
  view: RazorpaySettingsView;
}) {
  const save = useServerFn(updateRazorpaySettings);
  const [accounts] = useQuery(queries.orgAccount.active());
  const clearingAccounts = accounts.filter(
    (a) => a.kind === "gateway_clearing"
  );
  const form = useForm({
    defaultValues: {
      clearingAccountId: view.clearingAccountId ?? undefined,
      ...Object.fromEntries(
        NOTES_FIELDS.map((field) => [field, view.notesKeys[field].join(", ")])
      ),
    } as FormValues,
    onSubmit: async ({ value }) => {
      const notesKeys = Object.fromEntries(
        NOTES_FIELDS.map((field) => [field, splitNotesKeys(value[field])])
      ) as NotesKeys;
      await save({
        data: {
          ...(value.clearingAccountId
            ? { clearingAccountId: value.clearingAccountId }
            : {}),
          notesKeys,
        },
      })
        .then((result) => {
          toast.success("Razorpay settings saved", {
            description:
              result.requeuedCount > 0 || result.attachedBatchCount > 0
                ? "Payments that were waiting for the account are being recorded now."
                : undefined,
          });
          onSaved();
        })
        .catch((error: unknown) => {
          log.error({
            action: "updateRazorpaySettings",
            component: "RazorpaySection",
            error: error instanceof Error ? error.message : String(error),
          });
          toast.error("Couldn't save the Razorpay settings", {
            description: error instanceof Error ? error.message : undefined,
          });
        });
    },
    validators: { onSubmit: formSchema },
  });

  return (
    <FormLayout form={form}>
      <SettingsCard
        description="The gateway account payments are recorded into until Razorpay settles them to the bank."
        title="Clearing account"
      >
        <div className="px-4 py-3">
          <ComboboxField
            description={
              clearingAccounts.length === 0
                ? "Add a gateway clearing account in Settings → Organisation accounts first."
                : "Changing it after payments are recorded is a migration: earlier Razorpay gifts stay in the old account and can't be edited until they are moved to the new one."
            }
            disabled={!canManage}
            emptyMessage="No active gateway clearing accounts."
            label="Razorpay clearing account"
            name="clearingAccountId"
            options={clearingAccounts.map((a) => ({
              label: a.name,
              value: a.id,
            }))}
            placeholder="Search accounts..."
          />
        </div>
      </SettingsCard>
      <SettingsCard
        description="Payment Page fields arrive as notes. List the note keys that hold each detail, separated by commas; capitals, spaces and punctuation are ignored."
        title="Donor details from the Payment Page"
      >
        <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
          {NOTES_FIELDS.map((field) => (
            <InputField
              disabled={!canManage}
              key={field}
              label={NOTES_FIELD_LABELS[field]}
              name={field}
            />
          ))}
        </div>
      </SettingsCard>
      {canManage ? (
        <FormActions submitLabel="Save settings" submittingLabel="Saving..." />
      ) : null}
    </FormLayout>
  );
}

/** Settings → Integrations: the Razorpay Payment Page connection. */
export function RazorpaySection() {
  const { hasPermission } = useApp();
  const canManage = hasPermission("finance.manage");
  const load = useServerFn(getRazorpaySettings);
  const [view, setView] = useState<RazorpaySettingsView | null>(null);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = useEventCallback(() => setRefresh((n) => n + 1));

  // While a sync runs, refresh its progress every few seconds.
  const syncing = view !== null && view.reconcile.active !== null;
  useEffect(() => {
    if (!syncing) {
      return;
    }
    const timer = setInterval(reload, 3000);
    return () => clearInterval(timer);
  }, [reload, syncing]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((result) => {
        if (!cancelled) {
          setView(result);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFailed(true);
        }
        log.error({
          action: "getRazorpaySettings",
          component: "RazorpaySection",
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [load, refresh]);

  if (failed) {
    return (
      <p className="text-destructive text-sm">
        The Razorpay settings could not be loaded.
      </p>
    );
  }
  if (!view) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  let status = "Not configured";
  if (view.configured) {
    status =
      view.mode === "test" ? "Connected · test mode" : "Connected · live";
  }

  return (
    <div className="flex flex-col gap-6">
      {view.testInProduction ? (
        <Banner tone="danger">
          Payments are not being recorded. A Razorpay test key is configured on
          this production server, so every delivery is refused to keep test
          payments out of the real books. Replace RAZORPAY_KEY_ID with a live
          key.
        </Banner>
      ) : null}
      {view.inactiveAccountCount > 0 ? (
        <Banner tone="warning">
          {plural(view.inactiveAccountCount)} waiting because the clearing
          account they were opened with has been deactivated. Save an active
          clearing account below to record them.
        </Banner>
      ) : null}
      {view.syncFailedCount > 0 ? (
        <Banner tone="warning">
          {plural(view.syncFailedCount)} could not be synced with Razorpay after
          several tries. Review them from Income → Imports.
        </Banner>
      ) : null}
      {view.configured && !view.clearingAccountId ? (
        <Banner tone="warning">
          {view.clearingAccountUnusable
            ? "The chosen clearing account is no longer an active gateway clearing account."
            : "No clearing account is chosen."}{" "}
          Payments are kept and wait until one is saved below.
        </Banner>
      ) : null}

      <SettingsCard title="Razorpay Payment Page">
        <SettingsRow
          description={
            view.configured
              ? "Donations made on the Payment Page are recorded as contributions."
              : "Set RAZORPAY_KEY_ID and RAZORPAY_WEBHOOK_SECRET on the server to turn this on."
          }
          title="Status"
        >
          <span className="text-sm" data-testid="razorpay-status">
            {status}
          </span>
        </SettingsRow>
        <SettingsRow
          description={
            view.fetchesFromApi
              ? "Each payment is fetched from the Razorpay API."
              : "No API key secret is set, so the signed webhook copy of each payment is used."
          }
          title="Payment details"
        >
          <span className="text-sm">
            {view.fetchesFromApi ? "Razorpay API" : "Webhook"}
          </span>
        </SettingsRow>
        <SettingsRow
          description={settlementsDescription(view.settlements)}
          title="Settlements"
        >
          <span
            className="text-sm tabular-nums"
            data-testid="razorpay-settlements-status"
          >
            {settlementsLine(view.settlements)}
          </span>
        </SettingsRow>
        <SettingsRow title="Last webhook received">
          <span className="text-sm tabular-nums">
            {view.lastWebhookAt ? formatTime(view.lastWebhookAt) : "Never"}
          </span>
        </SettingsRow>
        {view.refundAttention.afterReceipt +
          view.refundAttention.amountChanged >
        0 ? (
          <SettingsRow
            description={attentionText(view.refundAttention)}
            title="Needs attention"
          >
            <span
              className="text-warning-foreground text-sm font-semibold tabular-nums"
              data-testid="razorpay-refund-attention"
            >
              {(
                view.refundAttention.afterReceipt +
                view.refundAttention.amountChanged
              ).toLocaleString("en-IN")}
            </span>
          </SettingsRow>
        ) : null}
        {view.pendingRefunds.waiting + view.pendingRefunds.notImported > 0 ? (
          <SettingsRow
            description="Razorpay refunded these before their payment was recorded; each is applied when its payment is imported."
            title="Refunds waiting"
          >
            <span className="flex flex-col items-end text-sm tabular-nums">
              <span data-testid="razorpay-pending-refunds">
                {view.pendingRefunds.waiting === 1
                  ? "1 refund waiting for its payment"
                  : `${view.pendingRefunds.waiting.toLocaleString("en-IN")} refunds waiting for their payment`}
              </span>
              {view.pendingRefunds.notImported > 0 ? (
                <span className="text-muted-foreground text-xs">
                  {view.pendingRefunds.notImported === 1
                    ? "1 refund for a payment that was not imported"
                    : `${view.pendingRefunds.notImported.toLocaleString("en-IN")} refunds for payments that were not imported`}
                </span>
              ) : null}
            </span>
          </SettingsRow>
        ) : null}
        <SettingsRow
          description="Payments that wait: to sync, for a clearing account, or for a decision such as a donor whose email matches an existing donor."
          title="Waiting"
        >
          <span
            className={
              view.pendingCount > 0
                ? "text-warning-foreground text-sm font-semibold tabular-nums"
                : "text-sm tabular-nums"
            }
            data-testid="razorpay-pending-count"
          >
            {view.pendingCount.toLocaleString("en-IN")}
          </span>
          {view.pendingCount > 0 ? (
            <Button
              render={<Link search={{ tab: "imports" }} to="/income" />}
              size="sm"
              type="button"
              variant="outline"
            >
              Review
            </Button>
          ) : null}
        </SettingsRow>
      </SettingsCard>

      <SettingsCard
        description="On the Razorpay dashboard, add a webhook with this URL, the same secret as RAZORPAY_WEBHOOK_SECRET, and these events."
        title="Webhook setup"
      >
        <SettingsRow title="Webhook URL">
          <CopyField label="Webhook URL" value={view.webhookUrl} />
        </SettingsRow>
        <SettingsRow title="Events">
          <span className="font-mono text-sm">
            {view.webhookEvents.join(", ")}
          </span>
        </SettingsRow>
      </SettingsCard>

      {view.configured ? (
        <RazorpaySyncCard
          canManage={canManage}
          onChanged={reload}
          reconcile={view.reconcile}
        />
      ) : null}

      <SettingsForm canManage={canManage} onSaved={reload} view={view} />
    </div>
  );
}
