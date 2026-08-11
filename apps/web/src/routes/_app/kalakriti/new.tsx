import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import {
  editionCalendarStart,
  editionMetadataFormFields,
  getRegistrationCloseTimestamp,
  registrationClosesBeforeEvent,
  registrationCloseTimeOptions,
} from "@/lib/kalakriti-edition-metadata";
import { handleMutationResult } from "@/lib/mutation-result";
import { assertPermission } from "@/lib/route-guards";

const editionFormSchema = z
  .object({
    ...editionMetadataFormFields,
    teamId: z.string().min(1, "Choose an owning team"),
    year: z.string().regex(/^20\d{2}$/, "Enter a four-digit year"),
  })
  .refine(registrationClosesBeforeEvent, {
    message: "Registration must close before the event date",
    path: ["registrationCloseDate"],
  });

export const Route = createFileRoute("/_app/kalakriti/new")({
  beforeLoad: ({ context }) => assertPermission(context, "kalakriti.admin"),
  component: NewKalakritiEditionRoute,
});

function NewKalakritiEditionRoute() {
  const zero = useZero();
  const navigate = useNavigate();
  const [teams] = useQuery(queries.team.all());
  const handleCancel = useEventCallback(() => navigate({ to: "/kalakriti" }));

  const form = useForm({
    defaultValues: {
      ageCutoffDate: undefined as Date | undefined,
      brandingKey: "",
      eventDate: undefined as Date | undefined,
      name: "",
      registrationCloseDate: undefined as Date | undefined,
      registrationCloseTime: "",
      teamId: "",
      year: "",
    },
    onSubmit: async ({ value }) => {
      if (
        !(value.eventDate && value.ageCutoffDate && value.registrationCloseDate)
      ) {
        return;
      }
      const editionId = uuidv7();
      const year = Number(value.year);
      const res = await zero.mutate(
        mutators.kalakritiEdition.create({
          ageCutoffDate: format(value.ageCutoffDate, "yyyy-MM-dd"),
          auditEntryId: uuidv7(),
          brandingKey: value.brandingKey.trim(),
          editionId,
          eventDate: format(value.eventDate, "yyyy-MM-dd"),
          name: value.name.trim(),
          now: Date.now(),
          plannedRegistrationCloseAt: getRegistrationCloseTimestamp(
            value.registrationCloseDate,
            value.registrationCloseTime
          ),
          teamEventId: uuidv7(),
          teamId: value.teamId,
          year,
        })
      ).server;

      handleMutationResult(res, {
        entityId: editionId,
        errorMsg: "Couldn't create Kalakriti Edition",
        mutation: "kalakritiEdition.create",
        successMsg: `Kalakriti ${year} created`,
      });
      if (res.type !== "error") {
        navigate({ params: { year: String(year) }, to: "/kalakriti/$year" });
      }
    },
    validators: {
      onChange: editionFormSchema,
      onSubmit: editionFormSchema,
    },
  });

  return (
    <div className="app-container mx-auto max-w-3xl px-2 py-6 sm:px-4">
      <Button
        nativeButton={false}
        render={<Link to="/kalakriti" />}
        size="sm"
        variant="ghost"
      >
        Back to Kalakriti
      </Button>
      <h1 className="mt-4 font-display font-semibold text-2xl tracking-tight">
        Create Kalakriti Edition
      </h1>
      <p className="mt-2 text-muted-foreground text-sm">
        This creates the yearly workspace and its protected organization event.
      </p>

      <FormLayout className="mt-8 space-y-6" form={form} showSubmitError>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField isRequired label="Year" name="year" placeholder="2028" />
          <InputField
            isRequired
            label="Edition name"
            name="name"
            placeholder="Kalakriti 2028"
          />
        </div>
        <SelectField
          description="The linked organization event belongs to this team."
          isRequired
          label="Owning team"
          name="teamId"
          options={teams.map((team) => ({ label: team.name, value: team.id }))}
          placeholder="Select a team"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField
            endMonth={new Date(2200, 11, 1)}
            isRequired
            label="Event date"
            name="eventDate"
            startMonth={editionCalendarStart}
          />
          <DateField
            endMonth={new Date(2200, 11, 1)}
            isRequired
            label="Age cutoff date"
            name="ageCutoffDate"
            startMonth={new Date(2000, 0, 1)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <DateField
            endMonth={new Date(2200, 11, 1)}
            isRequired
            label="Registration close date"
            name="registrationCloseDate"
            startMonth={editionCalendarStart}
          />
          <SelectField
            isRequired
            label="Registration close time (IST)"
            name="registrationCloseTime"
            options={registrationCloseTimeOptions}
            placeholder="Select a time"
          />
          <InputField
            description="Used by code-defined Edition branding."
            isRequired
            label="Branding key"
            name="brandingKey"
            placeholder="kalakriti-2028"
          />
        </div>
        <FormActions
          cancelLabel="Cancel"
          onCancel={handleCancel}
          submitLabel="Create Edition"
          submittingLabel="Creating..."
        />
      </FormLayout>
    </div>
  );
}
