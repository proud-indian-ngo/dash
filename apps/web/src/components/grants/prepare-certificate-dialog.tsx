import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { formatPaise, rupeesToPaise } from "@pi-dash/shared/money";
import {
  CERTIFICATE_PLACE_MAX,
  signatoryTitle,
} from "@pi-dash/shared/utilisation-certificates";
import { useForm, useStore } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { parseISO } from "date-fns";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import {
  prepareCertificateFn,
  previewUtilisationCertificate,
} from "@/functions/utilisation-certificates";
import { localDateToIso } from "@/lib/local-date";
import { isValidRupeesInput } from "@/lib/paise";

import { GRANT_LAST_MONTH } from "./grant-dates";

type Preview = Awaited<ReturnType<typeof previewUtilisationCertificate>>;

const requiredDate = (message: string) =>
  z
    .date()
    .optional()
    .refine((value) => value !== undefined, message);

const formSchema = z
  .object({
    from: requiredDate("Pick the first day"),
    interest: z
      .string()
      .refine(
        (v) => v.trim() !== "" && isValidRupeesInput(v),
        "Enter the interest in rupees, 0 if none"
      ),
    place: z
      .string()
      .trim()
      .min(1, "Say where it is signed")
      .max(CERTIFICATE_PLACE_MAX),
    to: requiredDate("Pick the last day"),
  })
  .refine((v) => !(v.from && v.to) || v.to >= v.from, {
    message: "The period ends before it starts",
    path: ["to"],
  });

function PreviewLine({ label, paise }: { label: string; paise: number }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
      <span>{label}</span>
      <span className="font-mono tabular-nums">{formatPaise(paise)}</span>
    </li>
  );
}

/** The figures preparing would freeze, the signatories and anything in the way. */
function PreviewPanel({ preview }: { preview: Preview }) {
  const { figures } = preview;
  return (
    <div className="flex flex-col gap-3" data-testid="certificate-preview">
      {preview.problems.length > 0 ? (
        <div
          className="border-warning/30 bg-warning/10 text-warning-foreground rounded-lg border px-3 py-2 text-sm"
          role="alert"
        >
          {preview.problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      ) : null}
      <ul className="divide-y rounded-lg border">
        <PreviewLine
          label="Unspent brought forward"
          paise={figures.broughtForwardPaise}
        />
        <PreviewLine label="Interest earned" paise={figures.interestPaise} />
        <PreviewLine
          label={`Received (${figures.received.length})`}
          paise={figures.receivedPaise}
        />
        {figures.refunds.length > 0 ? (
          <PreviewLine
            label={`Refunded (${figures.refunds.length})`}
            paise={figures.refundedPaise}
          />
        ) : null}
        <PreviewLine
          label="Total available"
          paise={figures.totalAvailablePaise}
        />
        <PreviewLine label="Spent" paise={figures.spentPaise} />
        <PreviewLine label="Closing unspent" paise={figures.closingPaise} />
      </ul>
      {preview.signatories ? (
        <p className="text-muted-foreground text-sm">
          {`Signed by ${preview.signatories.head.name}, ${signatoryTitle("head", preview.signatories.head)}, then ${preview.signatories.finance.name}, ${signatoryTitle("finance", preview.signatories.finance)}.`}
        </p>
      ) : null}
    </div>
  );
}

function PrepareForm({
  defaults,
  grantId,
  onOpenChange,
}: {
  defaults: { from: string; place: string; to: string };
  grantId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const loadPreview = useServerFn(previewUtilisationCertificate);
  const prepare = useServerFn(prepareCertificateFn);
  const [preview, setPreview] = useState<{
    key: string;
    value: Preview;
  } | null>(null);
  const form = useForm({
    defaultValues: {
      from: parseISO(defaults.from),
      interest: "0",
      place: defaults.place,
      to: parseISO(defaults.to),
    } as z.input<typeof formSchema>,
    onSubmit: async ({ value }) => {
      await prepare({
        data: {
          from: localDateToIso(value.from) ?? "",
          grantId,
          interestPaise: rupeesToPaise(value.interest.trim()),
          place: value.place.trim(),
          to: localDateToIso(value.to) ?? "",
        },
      })
        .then((prepared) => {
          toast.success(`Certificate ${prepared.number} prepared`);
          onOpenChange(false);
          navigate({
            params: { certificateId: prepared.id },
            to: "/finance/grants/certificates/$certificateId",
          });
        })
        .catch((error: unknown) => {
          toast.error("Couldn't prepare the certificate", {
            description:
              error instanceof Error ? error.message : "Something went wrong",
          });
        });
    },
    validators: { onChange: formSchema, onSubmit: formSchema },
  });
  const values = useStore(form.store, (state) => state.values);
  const from = localDateToIso(values.from);
  const to = localDateToIso(values.to);
  const interest = values.interest.trim();
  const ready =
    from !== null &&
    to !== null &&
    from <= to &&
    interest !== "" &&
    isValidRupeesInput(interest);
  const key = ready ? `${from}:${to}:${interest}` : null;

  useEffect(() => {
    if (!(key && from && to)) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      loadPreview({
        data: {
          from,
          grantId,
          interestPaise: rupeesToPaise(interest),
          to,
        },
      })
        .then((value) => {
          if (!cancelled) {
            setPreview({ key, value });
          }
        })
        .catch((error: unknown) => {
          log.error({
            action: "utilisationCertificate.preview",
            caughtError: error instanceof Error ? error.message : String(error),
            component: "PrepareCertificateDialog",
            grantId,
          });
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [from, grantId, interest, key, loadPreview, to]);

  const shown = preview && preview.key === key ? preview.value : null;
  const cancel = useEventCallback(() => onOpenChange(false));

  return (
    <FormLayout form={form}>
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          endMonth={GRANT_LAST_MONTH}
          isRequired
          label="From"
          name="from"
        />
        <DateField
          endMonth={GRANT_LAST_MONTH}
          isRequired
          label="To"
          name="to"
        />
        <InputField
          description="Interest isn't separated in the books; enter what the grant's money earned in the period."
          inputMode="decimal"
          isRequired
          label="Interest earned (₹)"
          name="interest"
        />
        <InputField isRequired label="Place" name="place" />
      </div>
      {shown ? (
        <PreviewPanel preview={shown} />
      ) : (
        <p className="text-muted-foreground text-sm" role="status">
          {ready ? "Working out the figures..." : "Pick the period."}
        </p>
      )}
      <FormActions
        disabled={!shown || shown.problems.length > 0}
        onCancel={cancel}
        submitLabel="Prepare certificate"
        submittingLabel="Preparing..."
      />
    </FormLayout>
  );
}

/**
 * Prepare certificate: the period, interest and place, with the figures
 * it will freeze. Preparing numbers it and stores its PDF for signing.
 */
export function PrepareCertificateDialog({
  defaults,
  grantId,
  onOpenChange,
  open,
}: {
  defaults: { from: string; place: string; to: string };
  grantId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>Prepare certificate</DialogTitle>
          <DialogDescription>
            The figures are frozen when you prepare it. The Head of the
            Organisation signs first, then the Chief Finance Officer.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <PrepareForm
            defaults={defaults}
            grantId={grantId}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
