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
  clearingAccountId: z
    .string()
    .optional()
    .refine(Boolean, "Pick the account Razorpay settles into"),
  name: z.string(),
  pan: z.string(),
  pincode: z.string(),
  state: z.string(),
});
type FormValues = z.input<typeof formSchema>;

const formatTime = (epoch: number) =>
  new Date(epoch).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

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
      try {
        const result = await save({
          data: {
            clearingAccountId: value.clearingAccountId ?? "",
            notesKeys,
          },
        });
        toast.success("Razorpay settings saved", {
          description:
            result.attachedBatchCount > 0
              ? "Payments that were waiting for the account can now be imported from Income → Imports."
              : undefined,
        });
        onSaved();
      } catch (error) {
        log.error({
          action: "updateRazorpaySettings",
          component: "RazorpaySection",
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error("Couldn't save the Razorpay settings", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
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
                : undefined
            }
            disabled={!canManage}
            emptyMessage="No active gateway clearing accounts."
            isRequired
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
        <FormActions submitLabel="Save" submittingLabel="Saving..." />
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
          A Razorpay test key is configured on this production server. Test
          payments will be recorded in the real books. Replace RAZORPAY_KEY_ID
          with a live key once testing is done.
        </Banner>
      ) : null}
      {view.configured && !view.clearingAccountId ? (
        <Banner tone="warning">
          {view.clearingAccountUnusable
            ? "The chosen clearing account is no longer an active gateway clearing account."
            : "No clearing account is chosen."}{" "}
          Payments are kept and wait in Needs review until one is saved below.
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
        <SettingsRow title="Last webhook received">
          <span className="text-sm tabular-nums">
            {view.lastWebhookAt ? formatTime(view.lastWebhookAt) : "Never"}
          </span>
        </SettingsRow>
        <SettingsRow
          description="Payments that wait for a decision, such as a donor whose email matches an existing donor."
          title="Needs review"
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

      <SettingsForm canManage={canManage} onSaved={reload} view={view} />
    </div>
  );
}
