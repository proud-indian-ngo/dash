import { auth } from "@pi-dash/auth";
import { refusalStatus } from "@pi-dash/observability";
import { getCurrentTraceId } from "@pi-dash/observability/trace-store";
import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { log } from "evlog";

import {
  captureThrownError,
  isServerFnRequest,
  routeTemplate,
  runWithErrorScope,
  validationRefusal,
} from "@/lib/server/error-tracking";

async function sessionUserId(request: Request): Promise<string | undefined> {
  const session = await auth.api.getSession({ headers: request.headers });
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
        // Not awaited: the user lookup must not delay the error response.
        captureThrownError(
          error,
          { route: routeTemplate(pathname), traceId: getCurrentTraceId() },
          () => sessionUserId(request)
        );
        throw error;
      }
    })
);

/**
 * Reports what server functions throw, and answers an RPC call that threw a
 * refusal (`refusalStatus`: an HttpError or another error of ours carrying a
 * 4xx) with that status; input the validator refused is a 400. An upstream
 * API's status is not ours to answer with. A server function called while
 * rendering a page keeps the page's status. Either way
 * Start serializes the error's name, message and own properties (the
 * status) to the client.
 */
const reportFunctionErrors = createMiddleware({ type: "function" }).server(
  async ({ next, serverFnMeta }) => {
    try {
      return await next();
    } catch (thrown) {
      const invalid = validationRefusal(thrown);
      if (invalid) {
        // Counted to spot client and server schemas drifting apart, such as
        // a stale bundle after a deploy; the values are never logged.
        log.warn({
          action: "inputValidationRefused",
          function: serverFnMeta.name,
          issues: invalid.issues,
        });
      }
      const error = invalid?.refusal ?? thrown;
      const status = refusalStatus(error);
      if (status !== undefined && status < 500 && isServerFnRequest()) {
        setResponseStatus(status);
      }
      const request = getRequest();
      captureThrownError(
        error,
        { route: serverFnMeta.name, traceId: getCurrentTraceId() },
        () => sessionUserId(request)
      );
      throw error;
    }
  }
);

export const startInstance = createStart(() => ({
  functionMiddleware: [reportFunctionErrors],
  requestMiddleware: [csrf, reportRequestErrors],
}));
