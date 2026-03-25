import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pi-dash/design-system/components/ui/table";
import { env } from "@pi-dash/env/web";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { FormModal } from "@/components/form/form-modal";
import { InputField } from "@/components/form/input-field";
import { TextareaField } from "@/components/form/textarea-field";
import { Loader } from "@/components/loader";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  createRole,
  deleteRole,
  getRoles,
  type RoleListItem,
} from "@/functions/role-admin";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_app/settings/roles/")({
  head: () => ({
    meta: [{ title: `Roles | ${env.VITE_APP_NAME}` }],
  }),
  component: RolesPage,
});

const createRoleFormSchema = z.object({
  id: z
    .string()
    .min(1, "ID is required")
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, "Lowercase slug only (e.g. team_lead)"),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional(),
});

type CreateRoleFormValues = z.infer<typeof createRoleFormSchema>;

const defaultValues: CreateRoleFormValues = {
  id: "",
  name: "",
  description: "",
};

function RolesPage() {
  const fetchRoles = useServerFn(getRoles);
  const createRoleFn = useServerFn(createRole);
  const deleteRoleFn = useServerFn(deleteRole);

  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleListItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadRoles = useCallback(async () => {
    try {
      const data = await fetchRoles();
      setRoles(data);
    } catch (error) {
      log.error({
        component: "RolesPage",
        action: "loadRoles",
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, [fetchRoles]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const handleCreate = async (values: CreateRoleFormValues) => {
    try {
      await createRoleFn({
        data: {
          id: values.id,
          name: values.name,
          description: values.description,
          permissionIds: [],
        },
      });
      toast.success("Role created");
      setCreateOpen(false);
      loadRoles();
    } catch (error) {
      log.error({
        component: "RolesPage",
        action: "createRole",
        roleId: values.id,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(getErrorMessage(error));
      throw error;
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleteLoading(true);
    try {
      await deleteRoleFn({ data: { roleId: deleteTarget.id } });
      toast.success("Role deleted");
      setDeleteTarget(null);
      loadRoles();
    } catch (error) {
      log.error({
        component: "RolesPage",
        action: "deleteRole",
        roleId: deleteTarget.id,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(getErrorMessage(error));
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="app-container mx-auto max-w-4xl px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-2xl">Roles</h1>
        <Button onClick={() => setCreateOpen(true)} size="sm" type="button">
          <HugeiconsIcon
            className="size-4"
            icon={PlusSignIcon}
            strokeWidth={2}
          />
          Add role
        </Button>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>All roles</CardTitle>
          <CardDescription>
            Manage roles and their permissions. System roles cannot be deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Permissions</TableHead>
                <TableHead className="text-center">Users</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {r.name}
                      {r.isSystem ? (
                        <Badge variant="secondary">System</Badge>
                      ) : null}
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {r.id}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">
                    {r.description ?? "--"}
                  </TableCell>
                  <TableCell className="text-center">
                    {r.permissionCount}
                  </TableCell>
                  <TableCell className="text-center">{r.userCount}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent hover:text-accent-foreground"
                        params={{ roleId: r.id }}
                        to="/settings/roles/$roleId"
                      >
                        {r.id === "admin" ? "View" : "Edit"}
                      </Link>
                      {r.isSystem ? null : (
                        <Button
                          onClick={() => setDeleteTarget(r)}
                          size="sm"
                          variant="outline"
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {roles.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="text-center text-muted-foreground"
                    colSpan={5}
                  >
                    No roles found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <FormModal
        description="Create a new role. You can assign permissions after creation."
        onOpenChange={setCreateOpen}
        open={createOpen}
        title="Create Role"
      >
        {createOpen ? (
          <CreateRoleForm
            onCancel={() => setCreateOpen(false)}
            onSubmit={handleCreate}
          />
        ) : null}
      </FormModal>

      <ConfirmDialog
        confirmLabel="Delete role"
        description={
          deleteTarget
            ? `This will permanently delete the "${deleteTarget.name}" role. The role must not be assigned to any users.`
            : ""
        }
        loading={deleteLoading}
        loadingLabel="Deleting..."
        onConfirm={handleDelete}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget !== null}
        title="Delete role"
        variant="destructive"
      />
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
