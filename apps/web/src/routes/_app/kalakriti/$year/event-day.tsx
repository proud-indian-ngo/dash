import { Button } from "@pi-dash/design-system/components/ui/button";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { KalakritiOperationType } from "@pi-dash/shared/kalakriti";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import { EventDayQrScanner } from "@/components/kalakriti/event-day-qr-scanner";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { canAccessKalakritiEventDay } from "@/lib/kalakriti-event-day-policy";
import { handleMutationResult } from "@/lib/mutation-result";

const TRANSPORT_OPERATION_TYPES = [
  { label: "Pickup", value: "pickup" },
  { label: "Venue departure", value: "venue_departure" },
  { label: "Drop-off", value: "drop_off" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: KalakritiOperationType;
}>;

type TransportOperationType =
  (typeof TRANSPORT_OPERATION_TYPES)[number]["value"];

export const Route = createFileRoute("/_app/kalakriti/$year/event-day")({
  beforeLoad: ({ context }) => {
    if (!canAccessKalakritiEventDay(context.kalakritiEditionAccess)) {
      throw notFound();
    }
  },
  component: KalakritiEventDayPage,
});

function KalakritiEventDayPage() {
  const zero = useZero();
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const [operationType, setOperationType] =
    useState<TransportOperationType>("pickup");
  const [humanId, setHumanId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const recordedKeysRef = useRef(new Set<string>());
  const pendingOperationIdsRef = useRef(new Map<string, string>());

  const handleOperationTypeChange = useEventCallback((value: string | null) => {
    if (value) {
      setOperationType(value as TransportOperationType);
    }
  });
  const handleHumanIdChange = useEventCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setHumanId(event.target.value);
    }
  );

  const recordTransport = useEventCallback(
    async ({
      dedupeKey,
      humanId: manualHumanId,
      credentialToken,
    }: {
      dedupeKey: string;
      humanId?: string;
      credentialToken?: string;
    }) => {
      if (recordedKeysRef.current.has(dedupeKey)) {
        toast.message("Already recorded");
        return;
      }

      const pendingKey = `${operationType}:${dedupeKey}`;
      const operationId =
        pendingOperationIdsRef.current.get(pendingKey) ?? uuidv7();
      pendingOperationIdsRef.current.set(pendingKey, operationId);

      const now = Date.now();
      const baseArgs = {
        auditEntryId: uuidv7(),
        editionId: edition.id,
        id: uuidv7(),
        now,
        occurredAt: now,
        operationId,
        type: operationType,
      };

      setIsSubmitting(true);
      try {
        const result = credentialToken
          ? await zero.mutate(
              mutators.kalakritiOperation.record({
                ...baseArgs,
                credentialToken,
              })
            ).server
          : await zero.mutate(
              mutators.kalakritiOperation.recordManual({
                ...baseArgs,
                humanId: manualHumanId ?? "",
              })
            ).server;

        if (result.type === "error") {
          handleMutationResult(result, {
            entityId: operationId,
            errorMsg: "Transport operation could not be recorded",
            mutation: credentialToken
              ? "kalakritiOperation.record"
              : "kalakritiOperation.recordManual",
          });
          return;
        }

        recordedKeysRef.current.add(dedupeKey);
        pendingOperationIdsRef.current.delete(pendingKey);
        toast.success("Transport recorded");
      } finally {
        setIsSubmitting(false);
      }
    }
  );

  const handleManualSubmit = useEventCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedHumanId = humanId.trim();
      if (!trimmedHumanId) {
        toast.error("Enter a yearly ID");
        return;
      }
      await recordTransport({
        dedupeKey: `manual:${trimmedHumanId}`,
        humanId: trimmedHumanId,
      });
    }
  );

  const handleQrScan = useEventCallback(async (credentialToken: string) => {
    const token = credentialToken.trim();
    if (!token) {
      return;
    }
    await recordTransport({
      credentialToken: token,
      dedupeKey: `qr:${token}`,
    });
  });

  return (
    <div className="space-y-8">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${edition.year}`}
        meta="Online-only transport station. Scan a credential QR or enter a yearly ID."
        title="Event day"
      />

      <section className="space-y-4 rounded-xl border p-4 sm:p-6">
        <div className="space-y-2">
          <Label htmlFor="transport-operation-type">Transport checkpoint</Label>
          <Select
            onValueChange={handleOperationTypeChange}
            value={operationType}
          >
            <SelectTrigger id="transport-operation-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSPORT_OPERATION_TYPES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h2 className="font-medium text-sm">Scan credential QR</h2>
            <p className="text-muted-foreground text-sm">
              Use the device camera while online. Duplicate scans are treated as
              already recorded.
            </p>
            <EventDayQrScanner onScan={handleQrScan} />
          </div>

          <form className="space-y-3" onSubmit={handleManualSubmit}>
            <h2 className="font-medium text-sm">Enter yearly ID</h2>
            <p className="text-muted-foreground text-sm">
              Record transport when a credential QR cannot be scanned.
            </p>
            <div className="space-y-2">
              <Label htmlFor="transport-human-id">Yearly ID</Label>
              <Input
                autoComplete="off"
                id="transport-human-id"
                onChange={handleHumanIdChange}
                placeholder="KAL-2027-0001"
                value={humanId}
              />
            </div>
            <Button disabled={isSubmitting} type="submit">
              Record transport
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
