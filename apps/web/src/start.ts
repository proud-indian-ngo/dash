import { auth } from "@pi-dash/auth";
import { getCurrentTraceId } from "@pi-dash/observability/trace-store";
import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";

import { HttpError } from "@/lib/http-error";
import {
  captureThrownError,
  isServerFnRequest,
  runWithErrorScope,
} from "@/lib/server/error-tracking";

async function sessionUserId(request: Request): Promise<string | undefined> {
  const session = await auth.api
    .getSession({ headers: request.headers })
    .catch(() => null);
  return session?.user.id;
}

// Start's default when no start instance exists; defining one replaces it.
const csrf = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

/** Reports what API routes and page requests throw; Start still answers. */
const reportRequestErrors = createMiddleware().server(
  ({ handlerType, next, pathname, request }) =>
    runWithErrorScope(handlerType, async () => {
      try {
        return await next();
      } catch (error) {
        await captureThrownError(
          error,
          { route: pathname, traceId: getCurrentTraceId() },
          () => sessionUserId(request)
        );
        throw error;
      }
    })
);

/**
 * Reports what server functions throw, and answers an RPC call that threw an
 * HttpError with its status. Start sends the client only the message either
 * way, so a server function called while rendering a page keeps the page's
 * status.
 */
const reportFunctionErrors = createMiddleware({ type: "function" }).server(
  async ({ next, serverFnMeta }) => {
    try {
      return await next();
    } catch (error) {
      if (error instanceof HttpError && isServerFnRequest()) {
        setResponseStatus(error.status);
      }
      await captureThrownError(
        error,
        { route: serverFnMeta.name, traceId: getCurrentTraceId() },
        () => sessionUserId(getRequest())
      );
      throw error;
    }
  }
);

export const startInstance = createStart(() => ({
  functionMiddleware: [reportFunctionErrors],
  requestMiddleware: [csrf, reportRequestErrors],
}));
