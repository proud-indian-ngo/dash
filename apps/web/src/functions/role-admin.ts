import { db } from "@pi-dash/db";
import { ADMIN_TIER_ROLES, PERMISSION_IDS } from "@pi-dash/db/permissions";
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
          id: role.id,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
          createdAt: role.createdAt,
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
  .inputValidator(getRoleByIdSchema)
  .handler(async ({ context, data }) => {
    await ensureRolePermission(context.session);

    try {
      const [found] = await db
        .select({
          id: role.id,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
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
          userId: context.session?.user.id,
          roleId: data.roleId,
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
          id: permission.id,
          name: permission.name,
          category: permission.category,
          description: permission.description,
        })
        .from(permission)
        .orderBy(permission.category, permission.name);

      const grouped: Record<
        string,
        { id: string; name: string; description: string | null }[]
      > = {};
      for (const p of perms) {
        const group = grouped[p.category] ?? [];
        grouped[p.category] = group;
        group.push({
          id: p.id,
          name: p.name,
          description: p.description,
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
  id: z
    .string()
    .min(1, "ID is required")
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, "Must be lowercase slug (e.g. team_lead)"),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional(),
  permissionIds: z.array(z.string()).default([]),
});

export const createRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(createRoleSchema)
  .handler(async ({ context, data }) => {
    await ensureRolePermission(context.session);

    try {
      // Validate permission IDs
      for (const pid of data.permissionIds) {
        if (!PERMISSION_IDS.has(pid)) {
          throw new Error(`Unknown permission: ${pid}`);
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
          id: data.id,
          name: data.name,
          description: data.description ?? null,
          isSystem: false,
        });

        if (data.permissionIds.length > 0) {
          await tx.insert(rolePermission).values(
            data.permissionIds.map((permId) => ({
              roleId: data.id,
              permissionId: permId,
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
          userId: context.session?.user.id,
          roleId: data.id,
          roleName: data.name,
          permissionCount: data.permissionIds.length,
        },
        error
      );
    }
  });

// ── Update role ──

const updateRoleSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional(),
  permissionIds: z.array(z.string()),
});

export const updateRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(updateRoleSchema)
  .handler(async ({ context, data }) => {
    await ensureRolePermission(context.session);

    try {
      // Validate permission IDs
      for (const pid of data.permissionIds) {
        if (!PERMISSION_IDS.has(pid)) {
          throw new Error(`Unknown permission: ${pid}`);
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
          .set({ name: data.name, description: data.description ?? null })
          .where(eq(role.id, data.roleId));

        await tx
          .delete(rolePermission)
          .where(eq(rolePermission.roleId, data.roleId));

        if (data.permissionIds.length > 0) {
          await tx.insert(rolePermission).values(
            data.permissionIds.map((permId) => ({
              roleId: data.roleId,
              permissionId: permId,
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
          userId: context.session?.user.id,
          roleId: data.roleId,
          permissionCount: data.permissionIds.length,
        },
        error
      );
    }
  });

// ── Delete role ──

const deleteRoleSchema = z.object({
  roleId: z.string().min(1),
});

export const deleteRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(deleteRoleSchema)
  .handler(async ({ context, data }) => {
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
          userId: context.session?.user.id,
          roleId: data.roleId,
        },
        error
      );
    }
  });
