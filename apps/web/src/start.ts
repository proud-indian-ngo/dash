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
 * Reports what server functions throw, and answers an RPC call that threw an
 * HttpError with its status; input the validator refused is a 400. A server
 * function called while rendering a page keeps the page's status. Either way
 * Start serializes the error's name, message and own properties (an
 * HttpError's status) to the client.
 */
const reportFunctionErrors = createMiddleware({ type: "function" }).server(
  async ({ next, serverFnMeta }) => {
    try {
      return await next();
    } catch (thrown) {
      const error = validationRefusal(thrown) ?? thrown;
      if (error instanceof HttpError && isServerFnRequest()) {
        setResponseStatus(error.status);
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
