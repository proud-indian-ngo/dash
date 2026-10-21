import {
  CancelCircleIcon,
  CheckmarkBadge01Icon,
  Clock01Icon,
  Unlink04Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

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
      </div>
    </Frame>
  );
}
