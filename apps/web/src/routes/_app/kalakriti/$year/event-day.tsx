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
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";

import { EventDayCorrectSection } from "@/components/kalakriti/event-day-correct-section";
import { EventDayQrScanner } from "@/components/kalakriti/event-day-qr-scanner";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import {
  canAccessKalakritiEventDay,
  canCorrectKalakritiEventDay,
} from "@/lib/kalakriti-event-day-policy";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

const TRANSPORT_OPERATION_TYPES = [
  { label: "Pickup", value: "pickup" },
  { label: "Venue departure", value: "venue_departure" },
  { label: "Drop-off", value: "drop_off" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: KalakritiOperationType;
}>;

const MEAL_OPERATION_TYPES = [
  { label: "Breakfast", value: "breakfast" },
  { label: "Lunch", value: "lunch" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: KalakritiOperationType;
}>;

const EVENT_DAY_STATIONS = [
  { label: "Transport", value: "transport" },
  { label: "Check-in", value: "check_in" },
  { label: "Meals", value: "meals" },
  { label: "Attendance", value: "attendance" },
] as const;

type EventDayStation = (typeof EVENT_DAY_STATIONS)[number]["value"];
type TransportOperationType =
  (typeof TRANSPORT_OPERATION_TYPES)[number]["value"];
type MealOperationType = (typeof MEAL_OPERATION_TYPES)[number]["value"];

interface CompetitionSessionView {
  cancelledAt: number | null;
  divisionId: string;
  id: string;
  startAt: number;
}

interface CompetitionDivisionView {
  competitionId: string;
  id: string;
}

interface CompetitionView {
  divisions: readonly CompetitionDivisionView[];
  id: string;
  name: string;
}

function formatSessionLabel(
  session: CompetitionSessionView,
  competitionName: string
): string {
  const start = new Date(session.startAt).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
  return `${competitionName} · ${start}`;
}

function operationTypeForStation(
  station: EventDayStation,
  transportOperationType: TransportOperationType,
  mealOperationType: MealOperationType
): KalakritiOperationType {
  if (station === "transport") {
    return transportOperationType;
  }
  if (station === "check_in") {
    return "volunteer_check_in";
  }
  if (station === "meals") {
    return mealOperationType;
  }
  return "competition_attendance";
}

function submitLabelForStation(station: EventDayStation): string {
  if (station === "transport") {
    return "Record transport";
  }
  if (station === "check_in") {
    return "Record check-in";
  }
  if (station === "meals") {
    return "Record meal";
  }
  return "Record attendance";
}

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
  const [station, setStation] = useState<EventDayStation>("transport");
  const [transportOperationType, setTransportOperationType] =
    useState<TransportOperationType>("pickup");
  const [mealOperationType, setMealOperationType] =
    useState<MealOperationType>("breakfast");
  const [sessionId, setSessionId] = useState("");
  const [humanId, setHumanId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const recordedKeysRef = useRef(new Set<string>());
  const pendingOperationIdsRef = useRef(new Map<string, string>());

  const [sessions] = useQuery(
    queries.kalakritiCompetition.sessions({ editionId: edition.id }),
    { enabled: station === "attendance" }
  );
  const [competitions] = useQuery(
    queries.kalakritiCompetition.competitions({ editionId: edition.id }),
    { enabled: station === "attendance" }
  );

  const competitionViews = competitions as CompetitionView[];
  const sessionViews = sessions as CompetitionSessionView[];
  const competitionNames = new Map(
    competitionViews.map((competition) => [competition.id, competition.name])
  );
  const divisionById = new Map(
    competitionViews.flatMap((competition) =>
      competition.divisions.map((division) => [division.id, division])
    )
  );
  const sessionOptions = sessionViews
    .filter((session) => session.cancelledAt === null)
    .map((session) => ({
      id: session.id,
      label: formatSessionLabel(
        session,
        competitionNames.get(
          divisionById.get(session.divisionId)?.competitionId ?? ""
        ) ?? "Unknown competition"
      ),
    }));

  const operationType = operationTypeForStation(
    station,
    transportOperationType,
    mealOperationType
  );

  const handleStationChange = useEventCallback((value: string | null) => {
    if (value) {
      setStation(value as EventDayStation);
    }
  });
  const handleTransportOperationTypeChange = useEventCallback(
    (value: string | null) => {
      if (value) {
        setTransportOperationType(value as TransportOperationType);
      }
    }
  );
  const handleMealOperationTypeChange = useEventCallback(
    (value: string | null) => {
      if (value) {
        setMealOperationType(value as MealOperationType);
      }
    }
  );
  const handleSessionChange = useEventCallback((value: string | null) => {
    if (value) {
      setSessionId(value);
    }
  });
  const handleHumanIdChange = useEventCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setHumanId(event.target.value);
    }
  );

  const recordOperation = useEventCallback(
    async ({
      dedupeKey,
      humanId: manualHumanId,
      credentialToken,
    }: {
      dedupeKey: string;
      humanId?: string;
      credentialToken?: string;
    }) => {
      if (station === "attendance" && !sessionId) {
        toast.error("Select a competition session");
        return;
      }

      const recordKey =
        station === "attendance"
          ? `${operationType}:${sessionId}:${dedupeKey}`
          : `${operationType}:${dedupeKey}`;
      if (recordedKeysRef.current.has(recordKey)) {
        toast.message("Already recorded");
        return;
      }

      const operationId =
        pendingOperationIdsRef.current.get(recordKey) ?? uuidv7();
      pendingOperationIdsRef.current.set(recordKey, operationId);

      const now = Date.now();
      const baseArgs = {
        auditEntryId: uuidv7(),
        editionId: edition.id,
        id: uuidv7(),
        now,
        occurredAt: now,
        operationId,
        sessionId: station === "attendance" ? sessionId : undefined,
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
            errorMsg: "Operation could not be recorded",
            mutation: credentialToken
              ? "kalakritiOperation.record"
              : "kalakritiOperation.recordManual",
            showErrorToast: false,
          });
          toast.error(
            getMutationResultErrorMessage(
              result.error,
              "Operation could not be recorded"
            )
          );
          return;
        }

        recordedKeysRef.current.add(recordKey);
        pendingOperationIdsRef.current.delete(recordKey);
        toast.success("Operation recorded");
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
      await recordOperation({
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
    await recordOperation({
      credentialToken: token,
      dedupeKey: `qr:${token}`,
    });
  });

  const submitLabel = submitLabelForStation(station);

  return (
    <div className="space-y-8">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${edition.year}`}
        meta="Online-only event-day stations. Scan a credential QR or enter a yearly ID."
        title="Event day"
      />

      <section className="space-y-4 rounded-xl border p-4 sm:p-6">
        <div className="space-y-2">
          <Label htmlFor="event-day-station">Station</Label>
          <Select onValueChange={handleStationChange} value={station}>
            <SelectTrigger id="event-day-station">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_DAY_STATIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {station === "transport" ? (
          <div className="space-y-2">
            <Label htmlFor="transport-operation-type">
              Transport checkpoint
            </Label>
            <Select
              onValueChange={handleTransportOperationTypeChange}
              value={transportOperationType}
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
        ) : null}

        {station === "meals" ? (
          <div className="space-y-2">
            <Label htmlFor="meal-operation-type">Meal</Label>
            <Select
              onValueChange={handleMealOperationTypeChange}
              value={mealOperationType}
            >
              <SelectTrigger id="meal-operation-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEAL_OPERATION_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {station === "attendance" ? (
          <div className="space-y-2">
            <Label htmlFor="attendance-session">Competition session</Label>
            <Select onValueChange={handleSessionChange} value={sessionId}>
              <SelectTrigger id="attendance-session">
                <SelectValue placeholder="Select a session" />
              </SelectTrigger>
              <SelectContent>
                {sessionOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-sm font-medium">Scan credential QR</h2>
            <p className="text-muted-foreground text-sm">
              Use the device camera while online. Duplicate scans are treated as
              already recorded.
            </p>
            <EventDayQrScanner onScan={handleQrScan} />
          </div>

          <form className="space-y-3" onSubmit={handleManualSubmit}>
            <h2 className="text-sm font-medium">Enter yearly ID</h2>
            <p className="text-muted-foreground text-sm">
              Record the operation when a credential QR cannot be scanned.
            </p>
            <div className="space-y-2">
              <Label htmlFor="event-day-human-id">Yearly ID</Label>
              <Input
                autoComplete="off"
                id="event-day-human-id"
                onChange={handleHumanIdChange}
                placeholder="KAL-2027-0001"
                value={humanId}
              />
            </div>
            <Button disabled={isSubmitting} type="submit">
              {submitLabel}
            </Button>
          </form>
        </div>
      </section>
      {canCorrectKalakritiEventDay(access) ? (
        <EventDayCorrectSection editionId={edition.id} />
      ) : null}
    </div>
  );
}
