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
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { KalakritiOperationType } from "@pi-dash/shared/kalakriti";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";

const CORRECTABLE_OPERATION_TYPES = [
  { label: "Pickup", value: "pickup" },
  { label: "Venue departure", value: "venue_departure" },
  { label: "Drop-off", value: "drop_off" },
  { label: "Volunteer check-in", value: "volunteer_check_in" },
  { label: "Breakfast", value: "breakfast" },
  { label: "Lunch", value: "lunch" },
  { label: "Competition attendance", value: "competition_attendance" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: KalakritiOperationType;
}>;

interface OperationRow {
  id: string;
  supersededByOperationId: string | null;
  type: KalakritiOperationType;
}

interface EventDayCorrectSectionProps {
  editionId: string;
}

export function EventDayCorrectSection({
  editionId,
}: EventDayCorrectSectionProps) {
  const zero = useZero();
  const [humanId, setHumanId] = useState("");
  const [lookupHumanId, setLookupHumanId] = useState("");
  const [operationType, setOperationType] =
    useState<KalakritiOperationType>("pickup");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subject, setSubject] = useState<{
    membershipId?: string;
    studentId?: string;
  } | null>(null);

  const hasLookupHumanId = lookupHumanId.length > 0;
  const [studentMatch] = useQuery(
    queries.kalakritiOperation.studentByHumanId({
      editionId,
      humanId: hasLookupHumanId ? lookupHumanId : "_",
    }),
    { enabled: hasLookupHumanId }
  );
  const [volunteerMatch] = useQuery(
    queries.kalakritiOperation.volunteerByHumanId({
      editionId,
      humanId: hasLookupHumanId ? lookupHumanId : "_",
    }),
    { enabled: hasLookupHumanId && !studentMatch }
  );
  const [operations] = useQuery(
    queries.kalakritiOperation.bySubject({
      editionId,
      membershipId: subject?.membershipId,
      studentId: subject?.studentId,
    }),
    {
      enabled: Boolean(subject?.membershipId || subject?.studentId),
    }
  );

  const targetOperation = useMemo(() => {
    const rows = (operations ?? []) as OperationRow[];
    return rows.find(
      (operation) =>
        operation.type === operationType &&
        operation.supersededByOperationId === null
    );
  }, [operationType, operations]);

  const handleHumanIdChange = useEventCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setHumanId(event.target.value);
      setSubject(null);
      setLookupHumanId("");
    }
  );
  const handleOperationTypeChange = useEventCallback((value: string | null) => {
    if (value) {
      setOperationType(value as KalakritiOperationType);
    }
  });
  const handleReasonChange = useEventCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setReason(event.target.value);
    }
  );

  const handleLookup = useEventCallback(() => {
    const value = humanId.trim();
    if (!value) {
      toast.error("Enter a yearly ID");
      return;
    }
    setSubject(null);
    setLookupHumanId(value);
  });

  useEffect(() => {
    if (!lookupHumanId) {
      return;
    }
    if (studentMatch) {
      setSubject({ studentId: studentMatch.id });
      return;
    }
    if (volunteerMatch) {
      setSubject({ membershipId: volunteerMatch.id });
      return;
    }
    toast.error("Yearly ID not found in this Edition");
  }, [lookupHumanId, studentMatch, volunteerMatch]);

  const handleSubmit = useEventCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedReason = reason.trim();
      if (!subject) {
        toast.error("Look up the yearly ID before correcting");
        return;
      }
      if (!trimmedReason) {
        toast.error("A correction reason is required");
        return;
      }
      if (!targetOperation) {
        toast.error("No effective operation found for that yearly ID and type");
        return;
      }

      setIsSubmitting(true);
      try {
        const now = Date.now();
        const result = await zero.mutate(
          mutators.kalakritiOperation.correct({
            auditEntryId: uuidv7(),
            editionId,
            id: uuidv7(),
            now,
            operationId: uuidv7(),
            reason: trimmedReason,
            targetOperationId: targetOperation.id,
          })
        ).server;

        if (result.type === "error") {
          handleMutationResult(result, {
            entityId: targetOperation.id,
            errorMsg: "Operation could not be corrected",
            mutation: "kalakritiOperation.correct",
            showErrorToast: false,
          });
          toast.error(
            getMutationResultErrorMessage(
              result.error,
              "Operation could not be corrected"
            )
          );
          return;
        }

        toast.success("Operation corrected");
        setReason("");
      } finally {
        setIsSubmitting(false);
      }
    }
  );

  return (
    <section className="space-y-4 rounded-xl border p-4 sm:p-6">
      <div>
        <h2 className="font-medium text-sm">Correct operation</h2>
        <p className="text-muted-foreground text-sm">
          Supersede the latest effective operation for a yearly ID. Ordinary
          station members cannot correct records.
        </p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="correct-human-id">Yearly ID</Label>
          <div className="flex gap-2">
            <Input
              autoComplete="off"
              id="correct-human-id"
              onChange={handleHumanIdChange}
              placeholder="KAL-2027-0001"
              value={humanId}
            />
            <Button onClick={handleLookup} type="button" variant="outline">
              Look up
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="correct-operation-type">Operation type</Label>
          <Select
            onValueChange={handleOperationTypeChange}
            value={operationType}
          >
            <SelectTrigger id="correct-operation-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CORRECTABLE_OPERATION_TYPES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="correct-reason">Reason</Label>
          <Textarea
            id="correct-reason"
            onChange={handleReasonChange}
            placeholder="Describe why this operation is being corrected"
            rows={3}
            value={reason}
          />
        </div>
        <Button disabled={isSubmitting} type="submit">
          Correct operation
        </Button>
      </form>
    </section>
  );
}
