import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useEffect } from "react";

import { ComboboxField } from "@/components/form/combobox-field";
import type { FormFieldApi } from "@/components/form/form-context";
import { useResolvedForm } from "@/components/form/form-context";

/** Clears a project that does not sit under the chosen programme. */
function ProjectGuard({
  field,
  valid,
}: {
  field: FormFieldApi<string | undefined>;
  valid: boolean;
}) {
  const projectId = field.state.value;
  const { handleChange } = field;
  useEffect(() => {
    if (projectId && !valid) {
      handleChange(undefined);
    }
  }, [handleChange, projectId, valid]);
  return null;
}

/**
 * The project an event's expenses count toward, under its programme. Mount
 * it only for `finance.manage`: projects sync to finance alone, and the
 * mutators ignore the field from anyone else.
 */
export function EventProjectField({ programmeId }: { programmeId: string }) {
  const form = useResolvedForm(undefined, "EventProjectField");
  const [projects, projectsResult] = useQuery(queries.project.all());
  return (
    <form.Field name="projectId">
      {(field: FormFieldApi<string | undefined>) => {
        const projectId = field.state.value;
        const options = projects
          .filter(
            (p) =>
              p.programmeId === programmeId &&
              (p.status !== "closed" || p.id === projectId)
          )
          .map((p) => ({ label: p.name, value: p.id }));
        const valid =
          projectsResult.type !== "complete" ||
          options.some((o) => o.value === projectId);
        return (
          <>
            <ProjectGuard field={field} valid={valid} />
            <ComboboxField
              description="Finance only. Claims and vendor payments on this event count toward it."
              emptyMessage="No open projects under this programme."
              label="Project"
              name="projectId"
              options={options}
              placeholder="No project"
            />
          </>
        );
      }}
    </form.Field>
  );
}
