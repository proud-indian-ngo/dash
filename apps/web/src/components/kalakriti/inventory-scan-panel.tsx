import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@pi-dash/design-system/components/ui/combobox";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { parseKalakritiPersonQr } from "@pi-dash/shared/kalakriti-person-qr";
import { inventoryBatchFieldsSchema } from "@pi-dash/zero/kalakriti-inventory-schema";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useConnectionState, useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { log } from "evlog";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { TextareaField } from "@/components/form/textarea-field";
import { Loader } from "@/components/loader";
import { getInventoryAssignmentOptions } from "@/lib/kalakriti-inventory-assignment-options";
import { handleMutationResult } from "@/lib/mutation-result";

import { EventDayQrScanner } from "./event-day-qr-scanner";

const batchFormSchema = z.object({
  selection: z.string(),
  notes: z.string().trim().max(500),
  items: inventoryBatchFieldsSchema.shape.items,
});

const manualSchema = z.object({
  humanId: z.string().trim().min(1, "Enter a volunteer yearly ID").max(64),
});
type BatchLine = z.infer<typeof inventoryBatchFieldsSchema>["items"][number];

export function InventoryScanPanel({
  action,
  editionId,
  year,
  onBusyChange,
}: {
  action: "dispatch" | "return";
  editionId: string;
  year: number;
  onBusyChange: (busy: boolean) => void;
}) {
  const [edition] = useQuery(queries.kalakritiEdition.byYear({ year }));
  const [volunteers, result] = useQuery(
    queries.kalakritiInventory.volunteers({ editionId })
  );
  const connection = useConnectionState();
  const [volunteerId, setVolunteerId] = useState<string | null>(null);
  const volunteer = volunteers.find((person) => person.id === volunteerId);
  const ready =
    result.type === "complete" &&
    connection.name === "connected" &&
    edition?.id === editionId &&
    edition.lifecycle !== "archived";
  const scan = useEventCallback((value: string) => {
    if (!ready || volunteer) return;
    try {
      const person = parseKalakritiPersonQr(value.trim());
      if (
        person.type !== "volunteer" ||
        !volunteers.some((row) => row.id === person.id)
      ) {
        toast.error("Scan an active volunteer from this Edition", {
          id: "inventory-scan-invalid",
        });
        return;
      }
      setVolunteerId(person.id);
    } catch (error) {
      log.error({
        component: "InventoryScanPanel",
        action: "parseVolunteerQr",
        editionId,
        error: "Invalid volunteer QR",
        errorType: error instanceof Error ? error.name : "unknown",
      });
      toast.error("Scan a valid volunteer QR code", {
        id: "inventory-scan-invalid",
      });
    }
  });
  const form = useForm({
    defaultValues: { humanId: "" },
    validators: { onChange: manualSchema, onSubmit: manualSchema },
    onSubmit: ({ value }) => {
      if (!ready) return;
      const person = volunteers.find(
        (row) =>
          row.humanId?.toLowerCase() === value.humanId.trim().toLowerCase()
      );
      if (person) setVolunteerId(person.id);
      else
        toast.error("No active volunteer with this yearly ID in this Edition");
    },
  });
  if (edition?.lifecycle === "archived")
    return <p role="status">Inventory is read-only in archived Editions.</p>;
  if (volunteer)
    return (
      <div className="space-y-4">
        <section
          aria-label="Scanned volunteer"
          className="bg-muted/30 rounded-lg border p-4"
        >
          <p className="text-muted-foreground text-sm">Responsible volunteer</p>
          <h3 className="font-semibold">
            {volunteer.user?.name ?? volunteer.snapshotName}
          </h3>
          <p className="text-muted-foreground text-sm">
            {volunteer.humanId ?? "Volunteer"}
          </p>
        </section>
        <InventoryBatchForm
          key={`${action}:${volunteer.id}`}
          action={action}
          editionId={editionId}
          volunteerId={volunteer.id}
          onBusyChange={onBusyChange}
          onReset={() => {
            setVolunteerId(null);
            form.reset();
          }}
        />
      </div>
    );
  return (
    <div className="space-y-4">
      {volunteerId ? (
        <p role="status">
          This volunteer is no longer available. Scan another volunteer.
        </p>
      ) : null}
      {connection.name !== "connected" ? (
        <p role="status">Scanning requires an online connection.</p>
      ) : null}
      {result.type !== "complete" ? (
        <Loader />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium">Scan volunteer QR</h3>
            {ready ? <EventDayQrScanner onScan={scan} /> : null}
          </div>
          <FormLayout form={form}>
            <InputField
              autoComplete="off"
              isRequired
              label="Volunteer yearly ID"
              name="humanId"
              placeholder="Enter the ID on the volunteer card"
              disabled={!ready}
            />
            <FormActions submitLabel="Find volunteer" disabled={!ready} />
          </FormLayout>
        </div>
      )}
    </div>
  );
}

function InventoryBatchForm({
  action,
  editionId,
  volunteerId,
  onBusyChange,
  onReset,
}: {
  action: "dispatch" | "return";
  editionId: string;
  volunteerId: string;
  onBusyChange: (busy: boolean) => void;
  onReset: () => void;
}) {
  const zero = useZero();
  const connection = useConnectionState();
  const [items, itemsResult] = useQuery(
    queries.kalakritiInventory.items({ editionId })
  );
  const [assignedVolunteer, assignmentsResult] = useQuery(
    queries.kalakritiInventory.assignments({
      editionId,
      volunteerMembershipId: volunteerId,
    })
  );
  const assignmentOptions = useMemo(
    () => getInventoryAssignmentOptions(assignedVolunteer?.assignments ?? []),
    [assignedVolunteer]
  );
  const schema = batchFormSchema.refine(
    (value) =>
      value.selection === "" ||
      assignmentOptions.some((option) => option.value === value.selection),
    {
      path: ["selection"],
      message:
        "This assignment is no longer available. Choose a current competition or role.",
    }
  );
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [now] = useState(Date.now);
  const anchor = useComboboxAnchor();
  const activeItems = items.filter((item) => item.archivedAt === null);
  const filteredItems = activeItems.filter((item) =>
    item.name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const ready =
    connection.name === "connected" &&
    itemsResult.type === "complete" &&
    assignmentsResult.type === "complete" &&
    assignedVolunteer?.id === volunteerId;
  const form = useForm({
    defaultValues: {
      selection: "",
      notes: "",
      items: [] as BatchLine[],
    },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      if (!ready) return;
      const selection = assignmentOptions.find(
        (option) => option.value === value.selection
      );
      setBusy(true);
      onBusyChange(true);
      try {
        const response = await zero.mutate(
          mutators.kalakritiInventory.recordBatch({
            type: action,
            volunteerMembershipId: volunteerId,
            items: value.items,
            notes: value.notes,
            competitionId: selection?.competitionId ?? null,
            responsibility: selection?.responsibility ?? null,
            editionId,
            now,
          })
        ).server;
        handleMutationResult(response, {
          mutation: "kalakritiInventory.recordBatch",
          entityId: volunteerId,
          successMsg:
            action === "dispatch" ? "Items dispatched" : "Items returned",
          errorMsg: "Stock movement could not be recorded",
        });
        if (response.type !== "error") onReset();
      } catch (error) {
        log.error({
          component: "InventoryScanPanel",
          action: "recordBatch",
          editionId,
          volunteerId,
          movementType: action,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error("Stock movement could not be recorded. Try again.");
      }
      setBusy(false);
      onBusyChange(false);
    },
  });
  return (
    <FormLayout form={form}>
      {!ready ? (
        <p role="status">Waiting for an online connection and inventory...</p>
      ) : null}
      <fieldset className="space-y-4" disabled={busy}>
        <CustomField<BatchLine[]> label="Items" name="items" isRequired>
          {(field) => (
            <>
              <Combobox
                multiple
                filter={null}
                inputValue={search}
                onInputValueChange={setSearch}
                value={field.state.value.map((line) => line.itemId)}
                onValueChange={(ids: string[]) => {
                  field.handleChange(
                    ids.map(
                      (itemId) =>
                        field.state.value.find(
                          (line) => line.itemId === itemId
                        ) ?? {
                          itemId,
                          quantity: 1,
                          transactionId: uuidv7(),
                          auditEntryId: uuidv7(),
                        }
                    )
                  );
                }}
              >
                <ComboboxChips ref={anchor}>
                  {field.state.value.map((line) => (
                    <ComboboxChip key={line.itemId}>
                      {items.find((item) => item.id === line.itemId)?.name ??
                        "Unavailable item"}
                    </ComboboxChip>
                  ))}
                  <ComboboxChipsInput
                    id={field.name}
                    onBlur={field.handleBlur}
                    placeholder="Search inventory items..."
                  />
                </ComboboxChips>
                <ComboboxContent anchor={anchor}>
                  <ComboboxList>
                    {filteredItems.map((item) => (
                      <ComboboxItem key={item.id} value={item.id}>
                        {item.name} · {item.quantity} in stock
                      </ComboboxItem>
                    ))}
                    {filteredItems.length === 0 ? (
                      <p className="text-muted-foreground p-2 text-sm">
                        No matching items.
                      </p>
                    ) : null}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              {field.state.value.map((line, index) => {
                const item = items.find((row) => row.id === line.itemId);
                return (
                  <div key={line.itemId} className="rounded-lg border p-3">
                    <InputField
                      name={`items[${index}].quantity`}
                      label={`${item?.name ?? "Unavailable item"} quantity`}
                      type="number"
                      min={1}
                      max={
                        action === "dispatch" ? item?.quantity : 2_147_483_647
                      }
                      step={1}
                      isRequired
                    />
                    <p className="text-muted-foreground mt-2 text-sm">
                      {item?.quantity ?? 0} in stock · After {action}:{" "}
                      {(item?.quantity ?? 0) +
                        (action === "dispatch"
                          ? -line.quantity
                          : line.quantity)}
                    </p>
                  </div>
                );
              })}
            </>
          )}
        </CustomField>
        <form.Subscribe selector={(state) => state.values.selection}>
          {(selection) =>
            assignmentOptions.length > 0 || selection ? (
              <SelectField
                label="Competition / role"
                name="selection"
                options={[
                  { label: "No competition or role", value: "" },
                  ...assignmentOptions,
                ]}
              />
            ) : assignmentsResult.type === "complete" ? (
              <p className="text-muted-foreground text-sm">
                This volunteer has no current role or competition assignments.
              </p>
            ) : null
          }
        </form.Subscribe>
        <TextareaField
          label="Purpose / notes"
          name="notes"
          placeholder="Optional"
        />
        <FormActions
          submitLabel={
            action === "dispatch" ? "Dispatch items" : "Return items"
          }
          submittingLabel="Recording..."
          disabled={!ready || busy}
        />
        <Button type="button" variant="outline" onClick={onReset}>
          Scan another volunteer
        </Button>
      </fieldset>
    </FormLayout>
  );
}
