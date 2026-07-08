import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { TableFilterSelect } from "@/components/data-table/table-filter-select";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { FormModal } from "@/components/form/form-modal";
import { InputField } from "@/components/form/input-field";
import { TextareaField } from "@/components/form/textarea-field";
import { RolesTable } from "@/components/roles/roles-table";
import {
  createRole,
  deleteRole,
  getRoles,
  type RoleListItem,
} from "@/functions/role-admin";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_app/settings/roles/")({
  component: RolesPage,
  head: () => ({
    meta: [{ title: `Roles | ${env.VITE_APP_NAME}` }],
  }),
});

const createRoleFormSchema = z.object({
  description: z.string().optional(),
  id: z
    .string()
    .min(1, "ID is required")
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, "Lowercase slug only (e.g. team_lead)"),
  name: z.string().min(1, "Name is required").max(100),
});

type CreateRoleFormValues = z.infer<typeof createRoleFormSchema>;

const TYPE_OPTIONS = [
  { label: "System", value: "system" },
  { label: "Custom", value: "custom" },
];

const defaultValues: CreateRoleFormValues = {
  description: "",
  id: "",
  name: "",
};

function RolesPage() {
  const fetchRoles = useServerFn(getRoles);
  const createRoleFn = useServerFn(createRole);
  const deleteRoleFn = useServerFn(deleteRole);

  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useQueryState(
    "type",
    parseAsString.withDefault("")
  );

  const loadRoles = useCallback(async () => {
    try {
      const data = await fetchRoles();
      setRoles(data);
    } catch (error) {
      log.error({
        action: "loadRoles",
        component: "RolesPage",
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Couldn't load roles");
    } finally {
      setLoading(false);
    }
  }, [fetchRoles]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const handleCreate = useEventCallback(
    async (values: CreateRoleFormValues) => {
      try {
        await createRoleFn({
          data: {
            description: values.description,
            id: values.id,
            name: values.name,
            permissionIds: [],
          },
        });
        toast.success("Role created!");
        setCreateOpen(false);
        loadRoles();
      } catch (error) {
        log.error({
          action: "createRole",
          component: "RolesPage",
          error: error instanceof Error ? error.message : String(error),
          roleId: values.id,
        });
        toast.error(getErrorMessage(error));
        throw error;
      }
    }
  );

  const handleDelete = useEventCallback(
    async ({ id: roleId }: { id: string; name: string }) => {
      try {
        await deleteRoleFn({ data: { roleId } });
        loadRoles();
        return { type: "success" as const };
      } catch (error) {
        log.error({
          action: "deleteRole",
          component: "RolesPage",
          error: error instanceof Error ? error.message : String(error),
          roleId,
        });
        return {
          error: { message: getErrorMessage(error) },
          type: "error" as const,
        };
      }
    }
  );
  const stableOnClearFilters0 = useEventCallback(() => setTypeFilter(""));
  const stableOnClick1 = useEventCallback(() => setCreateOpen(true));
  const stableOnCancel2 = useEventCallback(() => setCreateOpen(false));

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        Roles
      </h1>
      <div className="fade-in-0 mt-4 grid animate-in gap-6 fill-mode-backwards duration-200 *:min-w-0">
        <RolesTable
          data={
            typeFilter
              ? roles.filter((r) =>
                  typeFilter === "system" ? r.isSystem : !r.isSystem
                )
              : roles
          }
          hasActiveFilters={!!typeFilter}
          isLoading={loading}
          onClearFilters={stableOnClearFilters0}
          onDelete={handleDelete}
          toolbarActions={
            <Button onClick={stableOnClick1} size="sm" type="button">
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add role
            </Button>
          }
          toolbarFilters={
            <TableFilterSelect
              label="Type"
              onChange={setTypeFilter}
              options={TYPE_OPTIONS}
              value={typeFilter}
            />
          }
        />
      </div>

      <FormModal
        description="Create a new role. You can assign permissions after creation."
        onOpenChange={setCreateOpen}
        open={createOpen}
        title="Create Role"
      >
        {createOpen ? (
          <CreateRoleForm onCancel={stableOnCancel2} onSubmit={handleCreate} />
        ) : null}
      </FormModal>
    </div>
  );
}

function CreateRoleForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (values: CreateRoleFormValues) => Promise<void>;
}) {
  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
      form.reset();
    },
    validators: {
      onChange: createRoleFormSchema,
      onSubmit: createRoleFormSchema,
    },
  });

  return (
    <FormLayout form={form}>
      <InputField
        isRequired
        label="ID (slug)"
        name="id"
        placeholder="e.g. team_lead"
      />
      <InputField
        isRequired
        label="Name"
        name="name"
        placeholder="e.g. Team Lead"
      />
      <TextareaField
        label="Description"
        name="description"
        placeholder="Optional description"
        rows={2}
      />
      <FormActions
        form={form}
        onCancel={onCancel}
        submitLabel="Create role"
        submittingLabel="Creating..."
      />
    </FormLayout>
  );
}
