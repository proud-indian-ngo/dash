import { db } from "@pi-dash/db";
import {
  ADMIN_TIER_ROLES,
  isAssignablePermissionId,
  PERMISSION_IDS,
} from "@pi-dash/db/permissions";
import { invalidatePermissionCache } from "@pi-dash/db/queries/resolve-permissions";
import { user } from "@pi-dash/db/schema/auth";
import {
  permission,
  role,
  rolePermission,
} from "@pi-dash/db/schema/permission";
import { logErrorAndRethrow } from "@pi-dash/observability";
import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import z from "zod";
import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { authMiddleware } from "@/middleware/auth";

async function ensureRolePermission(
  session: { user: { id: string; role?: string | null } } | null
) {
  await assertServerPermission(session, "settings.roles");
}

// ── List all roles ──

export const getRoles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureRolePermission(context.session);

    try {
      const roles = await db
        .select({
          createdAt: role.createdAt,
          description: role.description,
          id: role.id,
          isSystem: role.isSystem,
          name: role.name,
          permissionCount: sql<number>`(
            select count(*)::int from role_permission rp where rp.role_id = ${role.id}
          )`,
          userCount: sql<number>`(
            select count(*)::int from "user" u where u.role = ${role.id}
          )`,
        })
        .from(role)
        .orderBy(role.name);

      return roles;
    } catch (error) {
      logErrorAndRethrow(
        { method: "GET", path: "/fn/getRoles" },
        { handler: "getRoles", userId: context.session?.user.id },
        error
      );
    }
  });

export type RoleListItem = Awaited<ReturnType<typeof getRoles>>[number];

// ── Role options for dropdowns (no special permission required) ──

export const getRoleOptions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    try {
      return await db
        .select({ id: role.id, name: role.name })
        .from(role)
        .orderBy(role.name);
    } catch (error) {
      const log = createRequestLogger();
      log.set({ handler: "getRoleOptions" });
      log.error(error instanceof Error ? error : String(error));
      log.emit();
      throw error;
    }
  });

// ── Get single role with its permission IDs ──

const getRoleByIdSchema = z.object({
  roleId: z.string().min(1),
});

export const getRoleById = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(getRoleByIdSchema)
  .handler(async ({ context, data }) => {
    await ensureRolePermission(context.session);

    try {
      const [found] = await db
        .select({
          description: role.description,
          id: role.id,
          isSystem: role.isSystem,
          name: role.name,
        })
        .from(role)
        .where(eq(role.id, data.roleId))
        .limit(1);

      if (!found) {
        throw new Error("Role not found");
      }

      const perms = await db
        .select({ permissionId: rolePermission.permissionId })
        .from(rolePermission)
        .where(eq(rolePermission.roleId, data.roleId));

      return {
        ...found,
        permissionIds: perms.map((p) => p.permissionId),
      };
    } catch (error) {
      logErrorAndRethrow(
        { method: "GET", path: "/fn/getRoleById" },
        {
          handler: "getRoleById",
          roleId: data.roleId,
          userId: context.session?.user.id,
        },
        error
      );
    }
  });

// ── Get all permissions grouped by category ──

export const getAllPermissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureRolePermission(context.session);

    try {
      const perms = await db
        .select({
          category: permission.category,
          description: permission.description,
          id: permission.id,
          name: permission.name,
        })
        .from(permission)
        .orderBy(permission.category, permission.name);

      const grouped: Record<
        string,
        { id: string; name: string; description: string | null }[]
      > = {};
      for (const p of perms) {
        if (!isAssignablePermissionId(p.id)) {
          continue;
        }
        const group = grouped[p.category] ?? [];
        grouped[p.category] = group;
        group.push({
          description: p.description,
          id: p.id,
          name: p.name,
        });
      }

      return grouped;
    } catch (error) {
      logErrorAndRethrow(
        { method: "GET", path: "/fn/getAllPermissions" },
        { handler: "getAllPermissions", userId: context.session?.user.id },
        error
      );
    }
  });

// ── Create role ──

const createRoleSchema = z.object({
  description: z.string().optional(),
  id: z
    .string()
    .min(1, "ID is required")
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, "Must be lowercase slug (e.g. team_lead)"),
  name: z.string().min(1, "Name is required").max(100),
  permissionIds: z.array(z.string()).default([]),
});

export const createRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createRoleSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    return await runSessionAuditedAction(
      context.session,
      context.headers,
      {
        action: "role.create",
        metadata: {
          changedFields: ["description", "name", "permissionIds"],
          permissionCount: data.permissionIds.length,
        },
        target: { id: data.id, type: "role" },
      },
      async () => {
        await ensureRolePermission(context.session);

        try {
          // Validate permission IDs
          for (const pid of data.permissionIds) {
            if (!PERMISSION_IDS.has(pid)) {
              throw new Error(`Unknown permission: ${pid}`);
            }
            if (!isAssignablePermissionId(pid)) {
              throw new Error(`Permission cannot be assigned: ${pid}`);
            }
          }

          // Check ID uniqueness
          const [existing] = await db
            .select({ id: role.id })
            .from(role)
            .where(eq(role.id, data.id))
            .limit(1);

          if (existing) {
            throw new Error(`Role ID "${data.id}" already exists`);
          }

          await db.transaction(async (tx) => {
            await tx.insert(role).values({
              description: data.description ?? null,
              id: data.id,
              isSystem: false,
              name: data.name,
            });

            if (data.permissionIds.length > 0) {
              await tx.insert(rolePermission).values(
                data.permissionIds.map((permId) => ({
                  permissionId: permId,
                  roleId: data.id,
                }))
              );
            }
          });

          return data.id;
        } catch (error) {
          logErrorAndRethrow(
            { method: "POST", path: "/fn/createRole" },
            {
              handler: "createRole",
              permissionCount: data.permissionIds.length,
              roleId: data.id,
              roleName: data.name,
              userId: context.session?.user.id,
            },
            error
          );
        }
      },
      undefined,
      (roleId) => ({ id: roleId, type: "role" })
    );
  });

// ── Update role ──

const updateRoleSchema = z.object({
  description: z.string().optional(),
  name: z.string().min(1, "Name is required").max(100),
  permissionIds: z.array(z.string()),
  roleId: z.string().min(1),
});

export const updateRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(updateRoleSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    return await runSessionAuditedAction(
      context.session,
      context.headers,
      {
        action: "role.update",
        metadata: {
          changedFields: ["description", "name", "permissionIds"],
          permissionCount: data.permissionIds.length,
        },
        target: { id: data.roleId, type: "role" },
      },
      async () => {
        await ensureRolePermission(context.session);

        try {
          // Validate permission IDs
          for (const pid of data.permissionIds) {
            if (!PERMISSION_IDS.has(pid)) {
              throw new Error(`Unknown permission: ${pid}`);
            }
            if (!isAssignablePermissionId(pid)) {
              throw new Error(`Permission cannot be assigned: ${pid}`);
            }
          }

          // Check role exists
          const [found] = await db
            .select({ id: role.id, isSystem: role.isSystem })
            .from(role)
            .where(eq(role.id, data.roleId))
            .limit(1);

          if (!found) {
            throw new Error("Role not found");
          }

          if (found.isSystem && ADMIN_TIER_ROLES.has(found.id)) {
            throw new Error("Cannot modify a system role");
          }

          await db.transaction(async (tx) => {
            await tx
              .update(role)
              .set({ description: data.description ?? null, name: data.name })
              .where(eq(role.id, data.roleId));

            await tx
              .delete(rolePermission)
              .where(eq(rolePermission.roleId, data.roleId));

            if (data.permissionIds.length > 0) {
              await tx.insert(rolePermission).values(
                data.permissionIds.map((permId) => ({
                  permissionId: permId,
                  roleId: data.roleId,
                }))
              );
            }
          });

          invalidatePermissionCache(data.roleId);

          return data.roleId;
        } catch (error) {
          logErrorAndRethrow(
            { method: "POST", path: "/fn/updateRole" },
            {
              handler: "updateRole",
              permissionCount: data.permissionIds.length,
              roleId: data.roleId,
              userId: context.session?.user.id,
            },
            error
          );
        }
      }
    );
  });

// ── Delete role ──

const deleteRoleSchema = z.object({
  roleId: z.string().min(1),
});

export const deleteRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(deleteRoleSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    return await runSessionAuditedAction(
      context.session,
      context.headers,
      {
        action: "role.delete",
        target: { id: data.roleId, type: "role" },
      },
      async () => {
        await ensureRolePermission(context.session);

        try {
          const [found] = await db
            .select({ id: role.id, isSystem: role.isSystem })
            .from(role)
            .where(eq(role.id, data.roleId))
            .limit(1);

          if (!found) {
            throw new Error("Role not found");
          }
          if (found.isSystem) {
            throw new Error("Cannot delete a system role");
          }

          // Check no users assigned
          const [result] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(user)
            .where(eq(user.role, data.roleId));

          if (result && result.count > 0) {
            throw new Error(
              `Cannot delete role: ${result.count} user(s) are still assigned to it`
            );
          }

          await db.delete(role).where(eq(role.id, data.roleId));

          invalidatePermissionCache(data.roleId);

          return data.roleId;
        } catch (error) {
          logErrorAndRethrow(
            { method: "POST", path: "/fn/deleteRole" },
            {
              handler: "deleteRole",
              roleId: data.roleId,
              userId: context.session?.user.id,
            },
            error
          );
        }
      }
    );
  });
