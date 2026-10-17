# Authorization

> **Load when**: permissions, roles, `assertHasPermission`, `assertHasPermissionOrTeamLead`, `can`, `hasPermission`, `assertPermission`, route permission guards, `team_lead`, `resolvePermissions`, `rolePermission`, UI permission gates.
> **Related**: `auth.md` (sessions and the `_app` session gate), `data-layer.md`, `caching.md`

## Model

```
role  →  rolePermission  →  permission
```

- Permissions are defined in code in `packages/db/src/permissions.ts`. `syncPermissions()` (`packages/db/src/sync-permissions.ts`) writes them to the `permission` table on server boot through the Nitro plugin `apps/web/server/plugins/sync-permissions.ts`.
- To add one, edit `permissions.ts`; it syncs on boot. Never delete or rename an ID without migrating `rolePermission` rows.
- Split `{entity}.view` (pickers, queries) from `{entity}.manage` (admin pages) when the admin page shows sensitive data.

## Roles

From most to least privileged:

1. `super_admin`: every permission, including reserved ones.
2. `admin` and `finance_admin`: code-managed system roles (`ADMIN_TIER_ROLES`) with different operational permissions.
3. Custom roles such as `team_lead`, managed in the role UI.
4. `volunteer`: oriented volunteers.
5. `unoriented_volunteer`: the default for new users and the fallback for a null role.

`external_user` is a technical role assigned only by its owning workflow (Kalakriti), never through user admin.

Better Auth's admin plugin only knows admin versus user. `toBetterAuthRole()` (`apps/web/src/functions/user-admin.ts`) maps admin-tier roles to `admin` and everything else to `volunteer`; the real role stays in `user.role`.

`requests.export` is reserved for `super_admin`. It is hidden from role management, rejected by custom-role mutations, left out of admin and finance-admin defaults, and stripped from every other role by `syncPermissions()`.

## Resolution

`resolvePermissions()` (`packages/db/src/queries/resolve-permissions.ts`) returns a role's permissions with a 60-second in-memory cache per instance. Call `invalidatePermissionCache()` after role or permission changes.

## Enforcement

| Layer | Check |
|---|---|
| Zero mutators (server pass) | `assertHasPermission(ctx, "id")` throws; `assertIsLoggedIn(ctx)` for any signed-in user |
| Team-scoped mutators | `assertHasPermissionOrTeamLead()` lets team leads act on their team without the global permission |
| Zero queries and conditional server checks | `can(ctx, "id")` |
| Route guards | `beforeLoad: ({ context }) => assertPermission(context, "id")` (`apps/web/src/lib/route-guards.ts`); `assertAnyPermission` for either-of. A denied user is redirected to `/` |
| Server functions and API routes | `assertServerPermission(session, "id")` or `assertServerAnyPermission` (`apps/web/src/lib/api-auth.ts`) throw; `resolvePermissions(role)` for complex checks |
| UI | `hasPermission("id")` from `AppContext` controls visibility |

The helpers for Zero live in `packages/zero/src/permissions.ts`. Client-side mutator runs are optimistic; the server pass is authoritative. Gate a protected route in `beforeLoad` and its UI action with `hasPermission`, and test `Route.options.beforeLoad` directly with denied and allowed contexts.
