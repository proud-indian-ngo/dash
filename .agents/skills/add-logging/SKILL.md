---
name: add-logging
description: Use when adding error handling, catch blocks, server-side tasks, or fire-and-forget operations. Ensures consistent structured logging patterns.
---

# Add Logging / Error Handling

## Client-Side Catch Blocks

Every `catch` block in client code MUST call `log.error()` from `evlog`:

```tsx
import { log } from "evlog";

try {
  await someOperation();
} catch (error) {
  log.error({
    component: "ComponentName",
    action: "actionName",
    entityId: id,
    error: error instanceof Error ? error.message : String(error),
  });
  toast.error("User-facing error message");
}
```

Include maximum context: component name, action, all available IDs.

## Zero Mutation Results

Always use `handleMutationResult` — never inline `if (res.type === "error")`:

```tsx
import { handleMutationResult } from "@/lib/mutation-result";

const res = await zero.mutate(mutators.entity.create({ ... })).server;
handleMutationResult(res, {
  mutation: "entity.create",
  entityId: id,
  successMsg: "Created",
  errorMsg: "Failed to create",
});
```

## Server-Side Logging

Use `createRequestLogger()` from `evlog`:

```tsx
import { createRequestLogger } from "evlog";

const log = createRequestLogger({ method, path });
log.set({ handler: "handlerName", userId, entityId, ...allContext });

try {
  // ... operation
  log.emit(); // ALWAYS emit on success path too
} catch (error) {
  log.error(error instanceof Error ? error : String(error));
  log.emit();
}
```

Rules:
- `createRequestLogger()` only accepts `{ method?, path?, requestId? }`
- Use `log.set()` for ALL additional context
- `log.error()` must not receive raw `unknown` — coerce with `error instanceof Error ? error : String(error)`
- Call `log.emit()` on BOTH success and error paths

## Warning Logs for Service-Not-Configured Bailouts

When an optional service (WhatsApp, Courier, Immich) is not configured, use `log.warn()` instead of silently returning:

```tsx
const log = createRequestLogger({ method: "POST", path: "functionName" });
log.set({ ...availableContext });
log.warn("whatsapp_not_configured");
log.emit();
return;
```

`log.warn(message, context?)` sets the wide event level to `"warn"`, making these events filterable by severity in log aggregation.

Available request logger methods by level:
- `log.info(message, context?)` — informational operational events
- `log.warn(message, context?)` — service unavailable, config missing, degraded operation
- `log.error(error, context?)` — errors and exceptions
- `log.set(context)` — accumulate context fields without setting level
- `log.emit()` — flush the wide event to the drain

## Enrichment Checklist

Every log MUST include maximum context. Minimum fields per category:

**Server functions:**
- `handler` — function name (e.g., `"createRole"`)
- `userId` — from `context.session?.user.id`
- All input IDs, names, counts from `data`

**API routes:**
- `userId` — from `session.user.id`
- Route params (e.g., `jobId: id`, `assetId: id`)
- Relevant query params (e.g., `queue`, `state`)

**Job handlers:**
- `jobId` — from `job.id`
- All payload fields relevant to the operation

**Service bailouts:**
- Function name (via `path` in `createRequestLogger`)
- All available IDs (phone, userId, groupJid, topicId)

## Mutator Async Tasks

Do NOT wrap task functions in `withTaskLog` inside mutators — `mutate.ts` already wraps them. Put rich context in the task `meta` object:

```tsx
// CORRECT
ctx.asyncTasks?.push({
  meta: { mutator: "myMutator", userId, entityId, title },
  fn: async () => {
    // task logic — no withTaskLog wrapper needed
  },
});

// WRONG — double wrapping
ctx.asyncTasks?.push({
  meta: { ... },
  fn: () => withTaskLog({ ... }, async () => { ... }), // DON'T DO THIS
});
```

## Fire-and-Forget Operations

Use `withFireAndForgetLog()` from `@pi-dash/observability`:

```tsx
import { withFireAndForgetLog } from "@pi-dash/observability";

withFireAndForgetLog(
  { handler: "operationName", userId, ...context },
  () => asyncOperation()
);
```

## Anti-Patterns

- **Never** use `console.error` — use `log.error()` from `evlog`
- **Never** silently swallow errors with `catch {}` — always log
- **Never** use `catch` without binding the error: use `catch (error)` not `catch {}`
- **Never** wrap mutator async task fns in `withTaskLog` — `mutate.ts` does it
- **Never** forget `log.emit()` on the success path when a logger is created
- **Never** call `log.error()` without `log.emit()` — `log.error()` accumulates but doesn't flush
- **Never** create `createRequestLogger` without `log.set()` context — error-only logs without context are undebuggable
- **Never** silently return when an optional service is not configured — use `log.warn()` so operators know the service was skipped
