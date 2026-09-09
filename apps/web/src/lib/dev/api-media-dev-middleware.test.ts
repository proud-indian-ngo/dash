import { describe, expect, it, mock } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { ViteDevServer } from "vite";

import { apiMediaDevMiddleware } from "./api-media-dev-middleware";

function middleware() {
  const use = mock();
  const configure = apiMediaDevMiddleware.configureServer;
  if (typeof configure !== "function")
    throw new Error("Missing configureServer hook");
  configure.call(
    {} as never,
    { middlewares: { use } } as unknown as ViteDevServer
  );
  return use.mock.calls[0]?.[0] as (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void
  ) => void;
}

function run(url: string, destination?: string) {
  const request = {
    url,
    method: "GET",
    headers: {
      "sec-fetch-dest": destination,
      cookie: "session-cookie",
      range: "bytes=0-",
      accept: "*/*",
    },
  } as unknown as IncomingMessage;
  const next = mock();
  middleware()(request, {} as ServerResponse, next);
  expect(next).toHaveBeenCalledTimes(1);
  return request;
}

describe("API media dev routing", () => {
  it.each(["image", "audio", "video"])(
    "routes native %s requests through the authenticated API",
    (destination) => {
      const url =
        "/api/attachments/download?kind=kalakritiEntryMusic&id=entry&disposition=inline";
      const request = run(url, destination);
      expect(request.headers["sec-fetch-dest"]).toBe("empty");
      expect(request.headers.cookie).toBe("session-cookie");
      expect(request.headers.range).toBe("bytes=0-");
      expect(request.headers.accept).toBe("*/*");
      expect(request.url).toBe(url);
    }
  );

  it.each(["document", "iframe", "empty", "script", undefined])(
    "leaves nonmedia API destination %s unchanged",
    (destination) => {
      expect(
        run("/api/attachments/download", destination).headers["sec-fetch-dest"]
      ).toBe(destination);
    }
  );

  it.each([
    "/assets/music.mp3",
    "/audio/example",
    "/api-other/file",
    "/@vite/client",
  ])("leaves static routing for %s unchanged", (url) => {
    expect(run(url, "audio").headers["sec-fetch-dest"]).toBe("audio");
  });

  it("is restricted to the dev server and runs before asset middleware", () => {
    expect(apiMediaDevMiddleware.apply).toBe("serve");
    expect(apiMediaDevMiddleware.enforce).toBe("pre");
  });
});
