import { describe, expect, it } from "bun:test";
import { Readable } from "node:stream";
import { createBrotliDecompress } from "node:zlib";

import { compressHtmlResponse } from "../../server/middleware/html-compression";

const HTML = "<!doctype html><p>Hello</p>";

function request(acceptEncoding: string, method = "GET") {
  return {
    headers: new Headers({ "Accept-Encoding": acceptEncoding }),
    method,
  };
}

function htmlResponse(
  headers: Record<string, string> = {},
  body: BodyInit = HTML
) {
  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-cache",
      "Content-Length": "28",
      "Content-Security-Policy": "default-src 'self'",
      "Content-Type": "text/html; charset=utf-8",
      "Set-Cookie": "session=test; HttpOnly",
      ...headers,
    },
    status: 201,
    statusText: "Created",
  });
}

async function decodeBrotli(response: Response): Promise<string> {
  if (!response.body) {
    throw new Error("Expected a Brotli response body");
  }
  const decoded = Readable.from(response.body).pipe(createBrotliDecompress());
  return await new Response(
    Readable.toWeb(decoded) as unknown as ReadableStream<Uint8Array>
  ).text();
}

async function decodeGzip(response: Response): Promise<string> {
  const decoded = response.body?.pipeThrough(new DecompressionStream("gzip"));
  return await new Response(decoded).text();
}

describe("HTML response compression", () => {
  it("streams Brotli HTML and preserves response metadata", async () => {
    const response = compressHtmlResponse(
      request("br, gzip;q=0.8"),
      htmlResponse({ ETag: '"identity-tag"', Vary: "Cookie" })
    );

    expect(response.status).toBe(201);
    expect(response.statusText).toBe("Created");
    expect(response.headers.get("Content-Encoding")).toBe("br");
    expect(response.headers.get("Content-Length")).toBeNull();
    expect(response.headers.get("Content-Type")).toBe(
      "text/html; charset=utf-8"
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "default-src 'self'"
    );
    expect(response.headers.get("Set-Cookie")).toBe("session=test; HttpOnly");
    expect(response.headers.get("Vary")).toBe("Cookie, Accept-Encoding");
    expect(response.headers.get("ETag")).toBe('W/"identity-tag"');
    expect(await decodeBrotli(response)).toBe(HTML);
  });

  it("streams and decodes gzip HTML", async () => {
    const response = compressHtmlResponse(request("gzip"), htmlResponse());

    expect(response.headers.get("Content-Encoding")).toBe("gzip");
    expect(await decodeGzip(response)).toBe(HTML);
  });

  for (const acceptEncoding of [
    "identity",
    "br;q=0",
    "gzip;q=0",
    "br;q=0, gzip;q=0, *;q=1",
  ]) {
    it(`serves identity HTML for ${acceptEncoding}`, async () => {
      const response = compressHtmlResponse(
        request(acceptEncoding),
        htmlResponse({ Vary: "Cookie" })
      );

      expect(response.headers.get("Content-Encoding")).toBeNull();
      expect(response.headers.get("Vary")).toBe("Cookie, Accept-Encoding");
      expect(await response.text()).toBe(HTML);
    });
  }

  for (const [acceptEncoding, expected] of [
    ["br", "br"],
    ["gzip", "gzip"],
    ["br, gzip", "br"],
    ["br;q=0.5, gzip;q=0.8", "gzip"],
    ["br;q=0, gzip", "gzip"],
    ["br, gzip;q=0", "br"],
    ["br;q=0, *;q=0.5", "gzip"],
    ["gzip;q=0, *;q=0.5", "br"],
  ] as const) {
    it(`selects ${expected} for ${acceptEncoding}`, async () => {
      const response = compressHtmlResponse(
        request(acceptEncoding),
        htmlResponse()
      );

      expect(response.headers.get("Content-Encoding")).toBe(expected);
      expect(
        await (expected === "br"
          ? decodeBrotli(response)
          : decodeGzip(response))
      ).toBe(HTML);
    });
  }

  it("compresses a body delivered in multiple chunks", async () => {
    const chunks = ["<!doctype html>", "<p>", "streamed", "</p>"];
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
    const response = compressHtmlResponse(
      request("br"),
      htmlResponse({}, body)
    );

    expect(await decodeBrotli(response)).toBe(chunks.join(""));
  });

  it("forwards source stream errors to the compressed response", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("source failed"));
      },
    });
    const response = compressHtmlResponse(
      request("br"),
      htmlResponse({}, body)
    );

    await expect(new Response(response.body).arrayBuffer()).rejects.toThrow(
      "source failed"
    );
  });

  it("cancels the source when the compressed response is cancelled", async () => {
    let sourceCancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("<!doctype html>"));
      },
      cancel() {
        sourceCancelled = true;
      },
    });
    const response = compressHtmlResponse(
      request("br"),
      htmlResponse({}, body)
    );

    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sourceCancelled).toBe(true);
  });

  it("does not duplicate an existing Accept-Encoding vary token", () => {
    const response = compressHtmlResponse(
      request("identity"),
      htmlResponse({ Vary: "Cookie, accept-encoding" })
    );

    expect(response.headers.get("Vary")).toBe("Cookie, accept-encoding");
  });

  it("leaves ineligible responses untouched", () => {
    const post = htmlResponse();
    const json = new Response("{}", {
      headers: { "Content-Type": "application/json" },
    });
    const encoded = htmlResponse({ "Content-Encoding": "br" });
    const noBody = new Response(null, {
      headers: { "Content-Type": "text/html" },
      status: 204,
    });

    expect(compressHtmlResponse(request("br", "POST"), post)).toBe(post);
    expect(compressHtmlResponse(request("br"), json)).toBe(json);
    expect(compressHtmlResponse(request("br"), encoded)).toBe(encoded);
    expect(compressHtmlResponse(request("br"), noBody)).toBe(noBody);
  });
});
