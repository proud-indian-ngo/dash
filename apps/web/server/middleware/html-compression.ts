import { pipeline, Readable } from "node:stream";
import { constants, createBrotliCompress } from "node:zlib";

import { onResponse } from "nitro/h3";

type CompressionRequest = Pick<Request, "headers" | "method">;
type ContentEncoding = "br" | "gzip";

function selectEncoding(value: string | null): ContentEncoding | null {
  if (!value) {
    return null;
  }

  let brotliQuality: number | undefined;
  let gzipQuality: number | undefined;
  let wildcardQuality: number | undefined;

  for (const item of value.split(",")) {
    const [rawEncoding, ...parameters] = item.split(";");
    const encoding = rawEncoding?.trim().toLowerCase();
    if (encoding !== "br" && encoding !== "gzip" && encoding !== "*") {
      continue;
    }

    let quality = 1;
    for (const parameter of parameters) {
      const [rawName, rawValue] = parameter.split("=", 2);
      if (rawName?.trim().toLowerCase() !== "q") {
        continue;
      }
      const qualityValue = rawValue?.trim();
      const parsed =
        qualityValue && /^\d(?:\.\d*)?$/.test(qualityValue)
          ? Number(qualityValue)
          : 0;
      quality = parsed >= 0 && parsed <= 1 ? parsed : 0;
      break;
    }

    if (encoding === "br") {
      brotliQuality = quality;
    } else if (encoding === "gzip") {
      gzipQuality = quality;
    } else {
      wildcardQuality = quality;
    }
  }

  const brotli = brotliQuality ?? wildcardQuality ?? 0;
  const gzip = gzipQuality ?? wildcardQuality ?? 0;
  if (brotli <= 0 && gzip <= 0) {
    return null;
  }
  return brotli >= gzip ? "br" : "gzip";
}

function addAcceptEncodingVary(headers: Headers): void {
  const vary = headers.get("Vary");
  if (
    vary === "*" ||
    vary
      ?.split(",")
      .some((value) => value.trim().toLowerCase() === "accept-encoding")
  ) {
    return;
  }
  headers.append("Vary", "Accept-Encoding");
}

function compressBrotli(
  body: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const compressor = createBrotliCompress({
    params: { [constants.BROTLI_PARAM_QUALITY]: 6 },
  });
  pipeline(Readable.from(body), compressor, () => {});
  return Readable.toWeb(compressor) as unknown as ReadableStream<Uint8Array>;
}

export function compressHtmlResponse(
  request: CompressionRequest,
  response: Response
): Response {
  if (
    request.method !== "GET" ||
    !response.body ||
    response.headers
      .get("Content-Type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "text/html" ||
    response.headers.has("Content-Encoding")
  ) {
    return response;
  }

  const headers = new Headers(response.headers);
  addAcceptEncodingVary(headers);
  const encoding = selectEncoding(request.headers.get("Accept-Encoding"));

  if (!encoding) {
    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  }

  headers.set("Content-Encoding", encoding);
  headers.delete("Content-Length");
  const etag = headers.get("ETag");
  if (etag && !etag.startsWith("W/")) {
    headers.set("ETag", `W/${etag}`);
  }

  const body =
    encoding === "br"
      ? compressBrotli(response.body)
      : response.body.pipeThrough(new CompressionStream("gzip"));
  return new Response(body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export default onResponse((response, event) =>
  compressHtmlResponse(event.req, response)
);
