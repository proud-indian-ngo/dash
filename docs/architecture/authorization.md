# Authorization

> **Load when**: permissions, roles, `assertHasPermission`, `assertHasPermissionOrTeamLead`, `can`, `hasPermission`, `assertPermission`, route guards, `resolvePermissions`, `rolePermission`, UI permission gates.
> **Related**: `auth.md` (sessions and the `_app` session gate), `data-layer.md`, `caching.md`

## Model

```
role  →  rolePermission  →  permission
```

- Permissions are defined in code in `packages/db/src/permissions.ts` and synced to the `permission` table on server boot.
- Never delete or rename an ID without migrating `rolePermission` rows.
- Split `{entity}.view` (pickers, queries) from `{entity}.manage` (admin pages) when the admin page shows sensitive data.

## Roles

From most to least privileged:

1. `super_admin`: every permission, including reserved ones.
2. `admin` and `finance_admin`: code-managed system roles with different operational permissions.
3. Custom roles such as `team_lead`, managed in the role UI.
4. `volunteer`: oriented volunteers.
5. `unoriented_volunteer`: the default for new users and the fallback for a null role.

`external_user` is a technical role assigned only by its owning workflow (Kalakriti), never through user admin.

Better Auth's admin plugin only knows admin versus user. `toBetterAuthRole()` maps roles onto it; the real role stays in `user.role`.

`requests.export` is reserved for `super_admin`. It is hidden from role management, rejected by custom-role mutations, and stripped from every other role on sync.

`notifications.view_delivery` opens the Notification delivery page, which shows the text of people's inbox and WhatsApp messages. It is granted to `admin` and withheld from `finance_admin`; `jobs.manage` does not include it.

## Resolution

`resolvePermissions()` caches a role's permissions in memory per instance. Call `invalidatePermissionCache()` after role or permission changes.

## Enforcement

| Layer | Check |
|---|---|
| Zero mutators (server pass) | `assertHasPermission(ctx, "id")`; `assertIsLoggedIn(ctx)` for any signed-in user |
| Team-scoped mutators | `assertHasPermissionOrTeamLead()` lets team leads act on their team without the global permission |
| Zero queries and conditional server checks | `can(ctx, "id")` |
| Route guards | `assertPermission(context, "id")` in `beforeLoad` (`apps/web/src/lib/route-guards.ts`) |
| Server functions and API routes | `assertServerPermission(session, "id")` (`apps/web/src/lib/api-auth.ts`) |
| UI | `hasPermission("id")` from `AppContext` controls visibility |

Server functions and API routes throw expected failures as `HttpError` (`apps/web/src/lib/http-error.ts`): 401 `Unauthorized` without a session, 403 `Forbidden` without the permission, 404 for a missing record. Start answers with that status, and Error Tracking skips them ([observability](observability.md#posthog)). A server function serializes the error's name, message and own properties, `status` included, to the client. Zero mutators throw plain errors, which Zero returns as mutation results.

Client-side mutator runs are optimistic; the server pass is authoritative. Gate a protected route in `beforeLoad` and its UI action with `hasPermission`, and test `Route.options.beforeLoad` directly with denied and allowed contexts.

A user's email and phone need `users.view`. The exception is a team's or event's own people: those who manage a team's or event's members see those members' contacts ([teams](teams-and-events.md#teams), [event members](teams-and-events.md#members-and-self-join)), and interest reviewers see pending requesters' ([interest](teams-and-events.md#interest)). Team leads qualify for their own teams. External users' contacts are never shown either way.
