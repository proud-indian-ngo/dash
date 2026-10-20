import { ArrowDown01Icon, ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ADMIN_TIER_ROLES } from "@pi-dash/db/permissions";
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
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useIsMobile } from "@pi-dash/design-system/hooks/use-mobile";
import { env } from "@pi-dash/env/web";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { TextareaField } from "@/components/form/textarea-field";
import { SaveBar } from "@/components/settings/settings-ui";
import { RecordNotFound } from "@/components/shared/not-found-state";
import { PageHeader } from "@/components/shared/page-header";
import { DetailPageSkeleton } from "@/components/shared/page-skeleton";
import { Tag } from "@/components/shared/status-badge";
import {
  getAllPermissions,
  getRoleById,
  updateRole,
} from "@/functions/role-admin";
import { useRecordTitle } from "@/hooks/use-record-title";
import { invalidateAdminUsersCache } from "@/lib/admin-users-cache";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_app/settings/roles/$roleId")({
  component: RoleEditPage,
  head: () => ({
    meta: [{ title: `Edit Role | ${env.VITE_APP_NAME}` }],
  }),
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

// The design-system checkbox has no partial state, so a partly granted group
// fills like a checked box and swaps the tick for a dash.
const INDETERMINATE_CLASS =
  "data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground data-indeterminate:[&_svg]:hidden data-indeterminate:before:h-0.5 data-indeterminate:before:w-2 data-indeterminate:before:rounded-full data-indeterminate:before:bg-current";

function PermissionCategoryCheckbox({
  allSelected,
  category,
  onToggle,
  partlySelected,
  permissions,
}: {
  allSelected: boolean;
  category: string;
  partlySelected: boolean;
  onToggle: (categoryPerms: { id: string }[], allSelected: boolean) => void;
  permissions: { id: string }[];
}) {
  const handleCheckedChange = useEventCallback(() =>
    onToggle(permissions, allSelected)
  );

  return (
    <Checkbox
      aria-label={`All ${category} permissions`}
      checked={allSelected}
      className={INDETERMINATE_CLASS}
      indeterminate={partlySelected}
      onCheckedChange={handleCheckedChange}
    />
  );
}

function PermissionCategoryTrigger({
  category,
  granted,
  total,
}: {
  category: string;
  granted: number;
  total: number;
}) {
  return (
    <CollapsibleTrigger className="group flex min-h-8 flex-1 items-center gap-2 text-left text-sm font-medium capitalize pointer-coarse:min-h-11">
      <span className="min-w-0 flex-1">{category}</span>
      <span className="text-muted-foreground font-mono text-xs">
        {granted}/{total}
      </span>
      <HugeiconsIcon
        className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-180"
        icon={ArrowDown01Icon}
        strokeWidth={2}
      />
    </CollapsibleTrigger>
  );
}

function PermissionCheckbox({
  checked,
  permission,
  onToggle,
}: {
  checked: boolean;
  onToggle: (permissionId: string) => void;
  permission: { id: string; name: string; description: string | null };
}) {
  const handleCheckedChange = useEventCallback(() => onToggle(permission.id));

  return (
    <div className="flex items-start gap-2 rounded-md px-2 py-1.5">
      <Checkbox
        checked={checked}
        id={`perm-${permission.id}`}
        onCheckedChange={handleCheckedChange}
      />
      <div className="grid gap-0.5">
        <Label
          className="cursor-pointer text-sm"
          htmlFor={`perm-${permission.id}`}
        >
          {permission.name}
        </Label>
        {permission.description ? (
          <span className="text-muted-foreground text-xs">
            {permission.description}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function symmetricDifferenceSize(
  selected: ReadonlySet<string>,
  saved: readonly string[]
): number {
  const savedSet = new Set(saved);
  let count = 0;
  for (const id of selected) {
    if (!savedSet.has(id)) {
      count += 1;
    }
  }
  for (const id of savedSet) {
    if (!selected.has(id)) {
      count += 1;
    }
  }
  return count;
}

function RoleEditPage() {
  const { roleId } = Route.useParams();
  const fetchRole = useServerFn(getRoleById);
  const fetchPermissions = useServerFn(getAllPermissions);
  const updateRoleFn = useServerFn(updateRole);

  const [roleData, setRoleData] = useState<RoleData | null>(null);
  useRecordTitle(roleData?.name);
  const [permissionGroups, setPermissionGroups] =
    useState<PermissionGroups | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  const isSystemRole = roleData ? ADMIN_TIER_ROLES.has(roleData.id) : false;

  const loadData = useEventCallback(async () => {
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
        action: "loadData",
        component: "RoleEditPage",
        error: error instanceof Error ? error.message : String(error),
        roleId,
      });
      toast.error("Couldn't load role");
    }
    setLoading(false);
  });

  useEffect(() => {
    loadData();
  }, [loadData, roleId]);

  const formKey = roleData ? `role-form-${roleData.id}` : "role-form-loading";

  const form = useForm({
    defaultValues: {
      description: roleData?.description ?? "",
      name: roleData?.name ?? "",
    },
    onSubmit: async ({ value }) => {
      try {
        await updateRoleFn({
          data: {
            description: value.description,
            name: value.name,
            permissionIds: [...selectedPermissions],
            roleId,
          },
        });
        invalidateAdminUsersCache();
        setRoleData((prev) =>
          prev
            ? {
                ...prev,
                description: value.description,
                name: value.name,
                permissionIds: [...selectedPermissions],
              }
            : prev
        );
        toast.success("Role saved!");
      } catch (error) {
        log.error({
          action: "updateRole",
          component: "RoleEditPage",
          error: error instanceof Error ? error.message : String(error),
          roleId,
        });
        toast.error(getErrorMessage(error));
        throw error;
      }
    },
  });

  const countFieldChanges = useEventCallback(
    (values: { description: string; name: string }) =>
      Number(values.name !== (roleData?.name ?? "")) +
      Number(values.description !== (roleData?.description ?? ""))
  );

  const togglePermission = useEventCallback((permId: string) => {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) {
        next.delete(permId);
      } else {
        next.add(permId);
      }
      return next;
    });
  });

  const toggleCategory = useEventCallback(
    (categoryPerms: { id: string }[], allSelected: boolean) => {
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
    }
  );

  if (loading) {
    return (
      <div>
        <DetailPageSkeleton />
      </div>
    );
  }

  if (!(roleData && permissionGroups)) {
    return (
      <div>
        <RecordNotFound
          backLabel="Back to roles"
          backTo="/settings/roles"
          noun="Role"
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm pointer-coarse:min-h-10"
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
      <PageHeader
        badge={roleData.isSystem ? <Tag>System</Tag> : null}
        meta={[`Role ID: ${roleData.id}`]}
        title={roleData.name}
      />
      {isSystemRole ? (
        <div className="border-border bg-muted/50 text-muted-foreground mt-4 rounded-md border p-3 text-sm">
          This system role cannot be modified.
        </div>
      ) : null}
      <FormLayout className="mt-6 space-y-6" form={form} key={formKey}>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>Role name and description.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <InputField
              disabled={isSystemRole}
              isRequired
              label="Name"
              name="name"
            />
            <TextareaField
              disabled={isSystemRole}
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
              {isSystemRole
                ? "System role permissions are managed in code and cannot be changed here."
                : "Select which permissions this role grants."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {Object.entries(permissionGroups).map(([category, allPerms]) => {
              // System roles are read-only: list only what they grant.
              const perms = isSystemRole
                ? allPerms.filter((p) => selectedPermissions.has(p.id))
                : allPerms;
              if (perms.length === 0) {
                return null;
              }
              const granted = allPerms.filter((p) =>
                selectedPermissions.has(p.id)
              ).length;

              return (
                <Collapsible defaultOpen={!isMobile} key={category}>
                  <div className="hover:bg-muted/50 flex items-center gap-3 rounded-md px-2">
                    {isSystemRole ? null : (
                      <PermissionCategoryCheckbox
                        allSelected={granted === allPerms.length}
                        category={category.replace(/_/g, " ")}
                        onToggle={toggleCategory}
                        partlySelected={
                          granted > 0 && granted < allPerms.length
                        }
                        permissions={allPerms}
                      />
                    )}
                    <PermissionCategoryTrigger
                      category={category.replace(/_/g, " ")}
                      granted={granted}
                      total={allPerms.length}
                    />
                  </div>
                  <CollapsibleContent>
                    {isSystemRole ? (
                      <ul className="space-y-1 pb-2 pl-2">
                        {perms.map((p) => (
                          <li className="grid gap-0.5 px-2 py-1.5" key={p.id}>
                            <span className="text-sm">{p.name}</span>
                            {p.description ? (
                              <span className="text-muted-foreground text-xs">
                                {p.description}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="ml-6 space-y-1 pb-2">
                        {perms.map((p) => (
                          <PermissionCheckbox
                            checked={selectedPermissions.has(p.id)}
                            key={p.id}
                            onToggle={togglePermission}
                            permission={p}
                          />
                        ))}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </CardContent>
        </Card>

        {isSystemRole ? null : (
          <form.Subscribe selector={(state) => state.values}>
            {(values) => {
              const changes =
                countFieldChanges(values) +
                symmetricDifferenceSize(
                  selectedPermissions,
                  roleData.permissionIds
                );
              return (
                <SaveBar
                  dirty={changes > 0}
                  summary={
                    changes === 1
                      ? "1 unsaved change"
                      : `${changes} unsaved changes`
                  }
                >
                  <FormActions
                    form={form}
                    submitLabel="Save changes"
                    submittingLabel="Saving..."
                  />
                </SaveBar>
              );
            }}
          </form.Subscribe>
        )}
      </FormLayout>
    </div>
  );
}
