# Authorization

> **Load when**: permissions, `assertHasPermission`, `can`, `hasPermission`, roles, role hierarchy, `team_lead`, `resolvePermissions`, `rolePermission` table, UI permission gates.
> **Related**: `auth.md`, `data-layer.md`

## Model

Permissions code-defined in `packages/db/src/permissions.ts`. Synced to `permission` table via `syncPermissions()` — runs on server boot via Nitro plugin `apps/web/server/plugins/sync-permissions.ts`. Roles in `role` table. `rolePermission` join table = roles → permissions.

```
role  →  rolePermission  →  permission (code-defined, DB-synced)
```

## Role Hierarchy

Stored in `role` table. Built-in (highest → lowest):

1. **super_admin** — all permissions, including reserved system-only permissions
2. **admin** and **finance_admin** — code-managed system roles with different operational permissions
3. **Custom roles** (e.g. `team_lead`) — configurable via role management UI
4. **volunteer** — baseline for oriented volunteers
5. **unoriented_volunteer** — minimal, default for new users pre-orientation

Default for new users + null-role fallback: `unoriented_volunteer`.

Better Auth admin plugin only knows `admin` vs `volunteer`. Custom roles live in `user.role` and map via `toBetterAuthRole()`: admin-level permissions → `admin`, else `volunteer`.

## Resolution

`resolvePermissions()` in `packages/db/src/queries/resolve-permissions.ts` fetches effective permissions from user's role. In-memory cache: 60 sec. Call `invalidatePermissionCache()` after role/permission changes.

## Enforcement Layers

| Layer | Mechanism |
|---|---|
| Zero mutators (server) | `assertHasPermission(ctx, "permission.id")` — throws if lacking |
| Zero mutators (team-scoped) | `assertHasPermissionOrTeamLead()` — team leads allowed team-scoped ops without global perm |
| Zero queries | `can(ctx, "permission.id")` — boolean for conditional filtering |
| Route guards | `assertPermission(session, "permission.id")` — server-side route protection |
| Server functions | `resolvePermissions(userId)` — direct resolution for complex checks |
| UI | `hasPermission("permission.id")` via `AppContext` — controls visibility |

## Permission Conventions

Separate `{entity}.view` (pickers/queries) from `{entity}.manage` (admin pages) when admin page exposes sensitive details. Don't delete/rename IDs without migrating `rolePermission` rows. Adding a permission: edit `packages/db/src/permissions.ts`, auto-syncs on boot.

`requests.export` is reserved for `super_admin`. It is omitted from role-management options, rejected by custom-role mutations, excluded from admin and finance-admin defaults, and removed from every non-super-admin role by `syncPermissions()`.
