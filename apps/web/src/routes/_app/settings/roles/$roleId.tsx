import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { Checkbox } from "@pi-dash/design-system/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@pi-dash/design-system/components/ui/collapsible";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { env } from "@pi-dash/env/web";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { TextareaField } from "@/components/form/textarea-field";
import { Loader } from "@/components/loader";
import {
  getAllPermissions,
  getRoleById,
  updateRole,
} from "@/functions/role-admin";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_app/settings/roles/$roleId")({
  head: () => ({
    meta: [{ title: `Edit Role | ${env.VITE_APP_NAME}` }],
  }),
  component: RoleEditPage,
});

interface RoleData {
  description: string | null;
  id: string;
  isSystem: boolean;
  name: string;
  permissionIds: string[];
}

type PermissionGroups = Record<
  string,
  { id: string; name: string; description: string | null }[]
>;

function RoleEditPage() {
  const { roleId } = Route.useParams();
  const fetchRole = useServerFn(getRoleById);
  const fetchPermissions = useServerFn(getAllPermissions);
  const updateRoleFn = useServerFn(updateRole);

  const [roleData, setRoleData] = useState<RoleData | null>(null);
  const [permissionGroups, setPermissionGroups] =
    useState<PermissionGroups | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(true);

  const isAdminRole = roleData?.id === "admin";

  const loadData = useCallback(async () => {
    try {
      const [r, perms] = await Promise.all([
        fetchRole({ data: { roleId } }),
        fetchPermissions(),
      ]);
      setRoleData(r);
      setPermissionGroups(perms);
      setSelectedPermissions(new Set(r.permissionIds));
    } catch (error) {
      log.error({
        component: "RoleEditPage",
        action: "loadData",
        roleId,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to load role");
    } finally {
      setLoading(false);
    }
  }, [fetchRole, fetchPermissions, roleId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const form = useForm({
    defaultValues: {
      name: roleData?.name ?? "",
      description: roleData?.description ?? "",
    },
    onSubmit: async ({ value }) => {
      try {
        await updateRoleFn({
          data: {
            roleId,
            name: value.name,
            description: value.description,
            permissionIds: [...selectedPermissions],
          },
        });
        toast.success("Role updated");
      } catch (error) {
        log.error({
          component: "RoleEditPage",
          action: "updateRole",
          roleId,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error(getErrorMessage(error));
        throw error;
      }
    },
  });

  // Reset form when roleData loads — form is intentionally excluded from deps
  // biome-ignore lint/correctness/useExhaustiveDependencies: form reference changes on every render
  useEffect(() => {
    if (roleData) {
      form.reset();
      form.setFieldValue("name", roleData.name);
      form.setFieldValue("description", roleData.description ?? "");
    }
  }, [roleData]);

  const togglePermission = (permId: string) => {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) {
        next.delete(permId);
      } else {
        next.add(permId);
      }
      return next;
    });
  };

  const toggleCategory = (
    categoryPerms: { id: string }[],
    allSelected: boolean
  ) => {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      for (const p of categoryPerms) {
        if (allSelected) {
          next.delete(p.id);
        } else {
          next.add(p.id);
        }
      }
      return next;
    });
  };

  if (loading) {
    return <Loader />;
  }

  if (!(roleData && permissionGroups)) {
    return (
      <div className="app-container mx-auto max-w-4xl px-4 py-6">
        <p className="text-muted-foreground">Role not found.</p>
      </div>
    );
  }

  return (
    <div className="app-container mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6">
        <Link
          className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
          to="/settings/roles"
        >
          <HugeiconsIcon
            className="size-4"
            icon={ArrowLeft01Icon}
            strokeWidth={2}
          />
          Back to roles
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <h1 className="font-semibold text-2xl">{roleData.name}</h1>
        {roleData.isSystem ? <Badge variant="secondary">System</Badge> : null}
      </div>
      <p className="mt-1 text-muted-foreground text-sm">
        Role ID: {roleData.id}
      </p>
      {isAdminRole ? (
        <div className="mt-4 rounded-md border border-border bg-muted/50 p-3 text-muted-foreground text-sm">
          The system admin role cannot be modified. Admins have all permissions
          by default.
        </div>
      ) : null}
      <FormLayout className="mt-6 space-y-6" form={form}>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>Role name and description.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <InputField
              disabled={isAdminRole}
              isRequired
              label="Name"
              name="name"
            />
            <TextareaField
              disabled={isAdminRole}
              label="Description"
              name="description"
              rows={2}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
            <CardDescription>
              {isAdminRole
                ? "Admin has all permissions. This cannot be changed."
                : "Select which permissions this role grants."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(permissionGroups).map(([category, perms]) => {
              const allSelected = perms.every((p) =>
                selectedPermissions.has(p.id)
              );

              return (
                <Collapsible defaultOpen key={category}>
                  <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                    <Checkbox
                      checked={allSelected}
                      disabled={isAdminRole}
                      onCheckedChange={() => toggleCategory(perms, allSelected)}
                    />
                    <CollapsibleTrigger className="flex-1 text-left font-medium text-sm capitalize">
                      {category.replace(/_/g, " ")}
                      <span className="ml-2 text-muted-foreground text-xs">
                        (
                        {
                          perms.filter((p) => selectedPermissions.has(p.id))
                            .length
                        }
                        /{perms.length})
                      </span>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent>
                    <div className="ml-6 space-y-1 pb-2">
                      {perms.map((p) => (
                        <div
                          className="flex items-start gap-2 rounded-md px-2 py-1.5"
                          key={p.id}
                        >
                          <Checkbox
                            checked={
                              isAdminRole || selectedPermissions.has(p.id)
                            }
                            disabled={isAdminRole}
                            id={`perm-${p.id}`}
                            onCheckedChange={() => togglePermission(p.id)}
                          />
                          <div className="grid gap-0.5">
                            <Label
                              className="cursor-pointer text-sm"
                              htmlFor={`perm-${p.id}`}
                            >
                              {p.name}
                            </Label>
                            {p.description ? (
                              <span className="text-muted-foreground text-xs">
                                {p.description}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </CardContent>
        </Card>

        {isAdminRole ? null : (
          <FormActions
            form={form}
            submitLabel="Save changes"
            submittingLabel="Saving..."
          />
        )}
      </FormLayout>
    </div>
  );
}
