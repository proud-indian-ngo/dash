import {
  Cancel01Icon,
  Tick02Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import type { EventInterest, User } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { format } from "date-fns";
import { log } from "evlog";
import { useEffect, useState } from "react";

import { StatusBadge } from "@/components/shared/status-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { UserHoverCard } from "@/components/shared/user-hover-card";
import {
  getEventInterestContacts,
  type InterestContact,
} from "@/functions/event-interest-contacts";
import { DATE } from "@/lib/date-formats";
import { deferAction, useDeferredIds } from "@/lib/deferred-actions";
import { handleMutationResult } from "@/lib/mutation-result";

export type InterestWithUser = EventInterest & { user: User | undefined };

interface InterestRequestsProps {
  eventId: string;
  interests: readonly InterestWithUser[];
}

const NON_DIGITS = /\D/g;

/**
 * Contact details for the given requesters. Fetches again only when a
 * requester appears whose contact is not loaded yet, not on every decision.
 */
function useInterestContacts(eventId: string, userIds: readonly string[]) {
  const [contacts, setContacts] = useState<{
    byUser: Record<string, InterestContact>;
    eventId: string;
  }>({ byUser: {}, eventId });
  const [settledKey, setSettledKey] = useState<null | string>(null);
  const known = contacts.eventId === eventId ? contacts.byUser : {};
  const missingKey = userIds.filter((id) => !(id in known)).join(",");
  const requestKey = `${eventId}:${missingKey}`;

  useEffect(() => {
    if (!missingKey) {
      return;
    }
    let current = true;
    getEventInterestContacts({ data: { eventId } })
      .then((byUser) => {
        if (current) {
          setContacts({ byUser, eventId });
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "getEventInterestContacts",
          component: "InterestRequests",
          entityId: eventId,
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        if (current) {
          setSettledKey(`${eventId}:${missingKey}`);
        }
      });
    return () => {
      current = false;
    };
  }, [eventId, missingKey]);

  return {
    contacts: known,
    loading: missingKey !== "" && settledKey !== requestKey,
  };
}

function InterestContactLinks({ contact }: { contact: InterestContact }) {
  return (
    <div className="flex flex-wrap gap-x-3 text-xs">
      {contact.phone ? (
        <>
          <a
            className="text-primary underline-offset-4 hover:underline"
            href={`tel:${contact.phone}`}
          >
            {contact.phone}
          </a>
          <a
            className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
            href={`https://wa.me/${contact.phone.replace(NON_DIGITS, "")}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            <HugeiconsIcon
              aria-hidden="true"
              className="size-3.5"
              icon={WhatsappIcon}
              strokeWidth={2}
            />
            WhatsApp
          </a>
        </>
      ) : null}
      <a
        className="text-primary truncate underline-offset-4 hover:underline"
        href={`mailto:${contact.email}`}
        title={contact.email}
      >
        {contact.email}
      </a>
    </div>
  );
}

function InterestRow({
  contact,
  contactLoading,
  interest,
}: {
  contact: InterestContact | undefined;
  contactLoading: boolean;
  interest: InterestWithUser;
}) {
  const zero = useZero();

  const decide = useEventCallback((decision: "approve" | "reject") => {
    const approve = decision === "approve";
    deferAction({
      ids: [interest.id],
      key: `eventInterest.${decision}:${interest.id}`,
      message: approve ? "Interest approved" : "Interest rejected",
      run: async () => {
        const args = { id: interest.id, now: Date.now() };
        const res = await zero.mutate(
          approve
            ? mutators.eventInterest.approve(args)
            : mutators.eventInterest.reject(args)
        ).server;
        handleMutationResult(res, {
          entityId: interest.id,
          errorMsg: approve
            ? "Failed to approve interest"
            : "Failed to reject interest",
          mutation: `eventInterest.${decision}`,
        });
      },
    });
  });
  const handleApprove = useEventCallback(() => decide("approve"));
  const handleReject = useEventCallback(() => decide("reject"));

  return (
    <li className="flex min-h-11 items-center gap-3 px-3 py-1.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {interest.user ? (
          <UserHoverCard
            triggerClassName="flex min-w-0 cursor-pointer items-center gap-3 [@media(pointer:coarse)]:pointer-events-none"
            user={interest.user}
          >
            <UserAvatar
              className="size-6"
              fallbackClassName="text-[10px]"
              user={interest.user}
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {interest.user.name}
              </div>
              <div className="text-muted-foreground text-xs">
                {format(new Date(interest.createdAt), DATE)}
              </div>
            </div>
          </UserHoverCard>
        ) : (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">Unknown</div>
            <div className="text-muted-foreground text-xs">
              {format(new Date(interest.createdAt), DATE)}
            </div>
          </div>
        )}
        <div className={interest.user ? "min-w-0 pl-9" : "min-w-0"}>
          {contact ? <InterestContactLinks contact={contact} /> : null}
          {!contact && contactLoading ? (
            <Skeleton className="my-0.5 h-3 w-48" />
          ) : null}
          {interest.message ? (
            <div className="text-muted-foreground mt-1 text-xs italic">
              "{interest.message}"
            </div>
          ) : null}
        </div>
      </div>
      {interest.status === "pending" ? (
        <div className="flex gap-1 pointer-coarse:gap-2">
          <Button
            aria-label={`Approve ${interest.user?.name ?? "request"}`}
            className="border-success/20 bg-success/10 text-success hover:bg-success/20 pointer-coarse:size-10"
            onClick={handleApprove}
            size="icon-sm"
            variant="outline"
          >
            <HugeiconsIcon
              aria-hidden="true"
              className="size-4"
              icon={Tick02Icon}
              strokeWidth={2}
            />
          </Button>
          <Button
            aria-label={`Reject ${interest.user?.name ?? "request"}`}
            className="pointer-coarse:size-10"
            onClick={handleReject}
            size="icon-sm"
            variant="destructive"
          >
            <HugeiconsIcon
              aria-hidden="true"
              className="size-4"
              icon={Cancel01Icon}
              strokeWidth={2}
            />
          </Button>
        </div>
      ) : (
        <StatusBadge
          tone={interest.status === "approved" ? "success" : "danger"}
        >
          {interest.status === "approved" ? "Approved" : "Rejected"}
        </StatusBadge>
      )}
    </li>
  );
}

export function InterestRequests({
  eventId,
  interests,
}: InterestRequestsProps) {
  const deferredIds = useDeferredIds();
  const pendingInterests = interests.filter(
    (i) => i.status === "pending" && !deferredIds.has(i.id)
  );
  const { contacts, loading } = useInterestContacts(
    eventId,
    pendingInterests.map((i) => i.userId)
  );

  if (pendingInterests.length === 0) {
    return null;
  }

  return (
    <section aria-label="Interest requests" className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">
        Interest requests ({pendingInterests.length})
      </h2>
      <ul className="divide-y rounded-lg border">
        {pendingInterests.map((interest) => (
          <InterestRow
            contact={contacts[interest.userId]}
            contactLoading={loading}
            interest={interest}
            key={interest.id}
          />
        ))}
      </ul>
    </section>
  );
}
