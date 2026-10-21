import {
  CancelCircleIcon,
  CheckmarkBadge01Icon,
  Clock01Icon,
  Unlink04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useId, useState } from "react";

import {
  NotFoundState,
  StandalonePage,
} from "@/components/shared/not-found-state";
import { DetailsCard, DetailsRow } from "@/components/shared/record-detail";
import {
  getReceiptVerification,
  receiptVerificationSearchSchema,
} from "@/functions/receipt-verification";

const WEBSITE = "https://proudindian.ngo";

// Search, then deps, then loader: TanStack infers each from the one before.
export const Route = createFileRoute("/verify/r/$receiptId")({
  validateSearch: receiptVerificationSearchSchema,
  loaderDeps: ({ search }) => ({ sig: search.s }),
  loader: ({ deps, params }) =>
    getReceiptVerification({
      data: { receiptId: params.receiptId, sig: deps.sig },
    }),
  component: ReceiptVerificationPage,
  head: () => ({
    meta: [
      { title: "Verify a donation receipt" },
      { content: "noindex", name: "robots" },
    ],
  }),
});

/** Donors and third parties land here signed out, so the way out is the website. */
function ContactButton() {
  return (
    <Button
      nativeButton={false}
      render={<a href={WEBSITE} />}
      variant="outline"
    >
      Contact Proud Indian
    </Button>
  );
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer()
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * Checks a PDF copy against the file as issued, by hash, in the browser:
 * the file never leaves the device. Any re-save changes the bytes, so a
 * mismatch says the file differs, not that it was forged.
 */
function PdfCopyCheck({ sha256 }: { sha256: string }) {
  const id = useId();
  const [outcome, setOutcome] = useState<"match" | "differs" | null>(null);
  const check = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setOutcome(null);
    if (file) {
      setOutcome((await sha256Hex(file)) === sha256 ? "match" : "differs");
    }
  };
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="mt-4 rounded-xl border p-4"
    >
      <h2 className="text-sm font-medium" id={`${id}-title`}>
        Check a PDF copy
      </h2>
      <p className="text-muted-foreground mt-1 text-sm" id={`${id}-hint`}>
        Have the receipt as a PDF? Choose it to check it hasn't been changed.
        The file stays on your device.
      </p>
      <input
        accept="application/pdf"
        aria-describedby={`${id}-hint`}
        aria-label="Receipt PDF to check"
        className="file:bg-muted mt-3 w-full min-w-0 text-sm file:mr-2 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
        onChange={check}
        type="file"
      />
      {outcome ? (
        <p
          className={`mt-3 flex items-start gap-2 text-sm ${outcome === "match" ? "text-success-foreground" : "text-destructive"}`}
          role="status"
        >
          <HugeiconsIcon
            className="mt-0.5 size-4 shrink-0"
            icon={outcome === "match" ? CheckmarkBadge01Icon : CancelCircleIcon}
            strokeWidth={2}
          />
          {outcome === "match"
            ? "This is the exact file Proud Indian issued."
            : "This isn't the exact file Proud Indian issued. It may have been edited, or saved again by another app. Compare its details with the ones above."}
        </p>
      ) : null}
    </section>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return <StandalonePage logoHref={WEBSITE}>{children}</StandalonePage>;
}

function ReceiptVerificationPage() {
  const result = Route.useLoaderData();

  if (result.status === "limited") {
    return (
      <Frame>
        <NotFoundState
          description="Wait a minute, then scan the code again."
          icon={Clock01Icon}
          title="Too many checks"
        />
      </Frame>
    );
  }

  if (result.status === "invalid") {
    return (
      <Frame>
        <NotFoundState
          actions={<ContactButton />}
          description="The link may be incomplete. Scan the code on the receipt again, and contact Proud Indian if this keeps happening."
          icon={Unlink04Icon}
          title="We couldn't verify this receipt"
        />
      </Frame>
    );
  }

  const valid = result.status === "valid";
  return (
    <Frame>
      <div className="w-full max-w-md">
        <NotFoundState
          actions={valid ? null : <ContactButton />}
          className="py-8"
          description={
            valid
              ? "Proud Indian issued this receipt. Check that the details below match your copy."
              : `Proud Indian cancelled this receipt on ${result.voidedOn}, so it is not valid. If Proud Indian sent you a new receipt for this donation, use that one.`
          }
          icon={valid ? CheckmarkBadge01Icon : CancelCircleIcon}
          iconClassName={
            valid
              ? "bg-success/15 text-success-foreground"
              : "bg-destructive/10 text-destructive"
          }
          title={valid ? "Genuine receipt" : "Cancelled receipt"}
        />
        <DetailsCard title="Receipt details">
          <DetailsRow label="Receipt no.">
            <span className="font-mono">{result.number}</span>
          </DetailsRow>
          <DetailsRow label="Issued on">{result.issuedOn}</DetailsRow>
          <DetailsRow label="Amount">{result.amount}</DetailsRow>
          <DetailsRow label="Mode">{result.mode}</DetailsRow>
          <DetailsRow label="Donor">{result.donor}</DetailsRow>
          {/* Catches the forgery that matters: an 80G line added to a receipt without one. */}
          <DetailsRow label="80G deduction">
            {result.with80G ? "Eligible" : "Not eligible"}
          </DetailsRow>
          <DetailsRow label="Trust PAN">
            <span className="font-mono">{result.orgPan}</span>
          </DetailsRow>
          <DetailsRow label="80G URN">
            <span className="font-mono">{result.urn}</span>
          </DetailsRow>
        </DetailsCard>
        {result.pdfSha256 ? <PdfCopyCheck sha256={result.pdfSha256} /> : null}
      </div>
    </Frame>
  );
}
