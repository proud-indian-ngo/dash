/**
 * A stand-in for Cloudflare R2, so E2E runs store files without real
 * credentials. It speaks the path-style S3 calls Bun's S3Client and
 * presigned browser URLs make (`/<bucket>/<key>`): object PUT, GET with
 * ranges, HEAD and DELETE, ListObjectsV2 and multipart uploads, which
 * `writer()` uses. Objects live in memory for the run; signatures are not
 * checked. Anything else is a 501, so a new operation fails loudly.
 */
const port = Number(process.env.E2E_R2_PORT);
if (!port) {
  throw new Error("E2E_R2_PORT is required");
}

interface StoredObject {
  body: Uint8Array;
  etag: string;
  lastModified: Date;
  type: string;
}

const objects = new Map<string, StoredObject>();
const uploads = new Map<
  string,
  { parts: Map<number, Uint8Array>; type: string }
>();
let uploadCounter = 0;

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, HEAD, PUT, POST, DELETE",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "ETag, Content-Length, Content-Range",
};

function respond(body: BodyInit | null, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(body, { ...init, headers });
}

const xml = (body: string, status = 200) =>
  respond(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    headers: { "Content-Type": "application/xml" },
    status,
  });

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const s3Error = (status: number, code: string) =>
  xml(`<Error><Code>${code}</Code><Message>${code}</Message></Error>`, status);

function store(path: string, body: Uint8Array, type: string): StoredObject {
  const etag = `"${new Bun.CryptoHasher("md5").update(body).digest("hex")}"`;
  const object = { body, etag, lastModified: new Date(), type };
  objects.set(path, object);
  return object;
}

function objectHeaders(object: StoredObject, url: URL): Headers {
  const params = url.searchParams;
  return new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": params.get("response-content-type") ?? object.type,
    ETag: object.etag,
    "Last-Modified": object.lastModified.toUTCString(),
    ...(params.has("response-content-disposition")
      ? {
          "Content-Disposition": params.get(
            "response-content-disposition"
          ) as string,
        }
      : {}),
  });
}

function read(object: StoredObject, request: Request, url: URL): Response {
  const headers = objectHeaders(object, url);
  const size = object.body.byteLength;
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (!range) {
    headers.set("Content-Length", String(size));
    return respond(request.method === "HEAD" ? null : object.body, { headers });
  }
  const [, from, to] = range;
  const start = from ? Number(from) : Math.max(size - Number(to), 0);
  const end = from && to ? Math.min(Number(to), size - 1) : size - 1;
  if (start >= size || start > end) {
    return s3Error(416, "InvalidRange");
  }
  headers.set("Content-Length", String(end - start + 1));
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  return respond(
    request.method === "HEAD" ? null : object.body.subarray(start, end + 1),
    { headers, status: 206 }
  );
}

function list(bucket: string, url: URL): Response {
  const prefix = url.searchParams.get("prefix") ?? "";
  const after =
    url.searchParams.get("continuation-token") ??
    url.searchParams.get("start-after") ??
    "";
  const maxKeys = Number(url.searchParams.get("max-keys") ?? 1000);
  const keys = [...objects.keys()]
    .filter((path) => path.startsWith(`${bucket}/`))
    .map((path) => path.slice(bucket.length + 1))
    .filter((key) => key.startsWith(prefix) && key > after)
    .sort();
  const page = keys.slice(0, maxKeys);
  const truncated = keys.length > page.length;
  const contents = page
    .map((key) => {
      const object = objects.get(`${bucket}/${key}`) as StoredObject;
      return `<Contents><Key>${escapeXml(key)}</Key><LastModified>${object.lastModified.toISOString()}</LastModified><ETag>${escapeXml(object.etag)}</ETag><Size>${object.body.byteLength}</Size><StorageClass>STANDARD</StorageClass></Contents>`;
    })
    .join("");
  return xml(
    `<ListBucketResult><Name>${escapeXml(bucket)}</Name><Prefix>${escapeXml(prefix)}</Prefix><KeyCount>${page.length}</KeyCount><MaxKeys>${maxKeys}</MaxKeys><IsTruncated>${truncated}</IsTruncated>${truncated ? `<NextContinuationToken>${escapeXml(page.at(-1) as string)}</NextContinuationToken>` : ""}${contents}</ListBucketResult>`
  );
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return respond(null, {
      headers: {
        "Access-Control-Allow-Headers":
          request.headers.get("access-control-request-headers") ?? "*",
      },
      status: 204,
    });
  }
  if (url.pathname === "/health") {
    return respond("ok");
  }
  const path = decodeURIComponent(url.pathname.slice(1));
  const [bucket = "", ...rest] = path.split("/");
  const key = rest.join("/");
  if (!key) {
    return request.method === "GET" && url.searchParams.get("list-type") === "2"
      ? list(bucket, url)
      : s3Error(501, "NotImplemented");
  }
  const uploadId = url.searchParams.get("uploadId");
  const type =
    request.headers.get("content-type") ?? "application/octet-stream";

  switch (request.method) {
    case "GET":
    case "HEAD": {
      const object = objects.get(path);
      return object ? read(object, request, url) : s3Error(404, "NoSuchKey");
    }
    case "PUT": {
      if (request.headers.has("x-amz-copy-source")) {
        return s3Error(501, "NotImplemented");
      }
      const body = new Uint8Array(await request.arrayBuffer());
      if (uploadId) {
        const upload = uploads.get(uploadId);
        if (!upload) {
          return s3Error(404, "NoSuchUpload");
        }
        upload.parts.set(Number(url.searchParams.get("partNumber")), body);
        const etag = `"${new Bun.CryptoHasher("md5").update(body).digest("hex")}"`;
        return respond(null, { headers: { ETag: etag } });
      }
      return respond(null, { headers: { ETag: store(path, body, type).etag } });
    }
    case "POST": {
      if (url.searchParams.has("uploads")) {
        uploadCounter += 1;
        const id = `e2e-upload-${uploadCounter}`;
        uploads.set(id, { parts: new Map(), type });
        return xml(
          `<InitiateMultipartUploadResult><Bucket>${escapeXml(bucket)}</Bucket><Key>${escapeXml(key)}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`
        );
      }
      const upload = uploadId ? uploads.get(uploadId) : undefined;
      if (!(uploadId && upload)) {
        return s3Error(404, "NoSuchUpload");
      }
      uploads.delete(uploadId);
      const parts = [...upload.parts.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, part]) => part);
      const object = store(
        path,
        new Uint8Array(await new Blob(parts).arrayBuffer()),
        upload.type
      );
      return xml(
        `<CompleteMultipartUploadResult><Bucket>${escapeXml(bucket)}</Bucket><Key>${escapeXml(key)}</Key><ETag>${escapeXml(object.etag)}</ETag></CompleteMultipartUploadResult>`
      );
    }
    case "DELETE": {
      if (uploadId) {
        uploads.delete(uploadId);
      } else {
        objects.delete(path);
      }
      return respond(null, { status: 204 });
    }
    default:
      return s3Error(501, "NotImplemented");
  }
}

Bun.serve({
  async fetch(request) {
    const response = await handle(request);
    if (response.status === 501) {
      console.error(`fake R2: no handler for ${request.method} ${request.url}`);
    }
    return response;
  },
  port,
});

console.log(`fake R2 listening on ${port}`);
