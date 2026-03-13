import { env } from "@pi-dash/env/server";
import { S3Client } from "bun";

function requireEnv() {
  const apiKey = env.IMMICH_API_KEY;
  const serverUrl = env.IMMICH_SERVER_URL;
  if (!(apiKey && serverUrl)) {
    throw new Error("IMMICH_API_KEY and IMMICH_SERVER_URL must be set");
  }
  return { apiKey, serverUrl };
}

function getImmichHeaders() {
  const { apiKey } = requireEnv();
  return {
    "x-api-key": apiKey,
  };
}

function getImmichUrl(path: string) {
  const { serverUrl } = requireEnv();
  return `${serverUrl}/api${path}`;
}

function getS3() {
  return new S3Client({
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_KEY_ID,
    bucket: env.R2_BUCKET_NAME,
  });
}

export async function createImmichAlbum(albumName: string): Promise<string> {
  const res = await fetch(getImmichUrl("/albums"), {
    method: "POST",
    headers: {
      ...getImmichHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ albumName }),
  });
  if (!res.ok) {
    throw new Error(
      `Immich createAlbum failed: ${res.status} ${await res.text()}`
    );
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function uploadAssetToImmichAlbum(
  albumId: string,
  r2Key: string,
  filename: string
): Promise<string> {
  // Download from R2
  const s3 = getS3();
  const file = s3.file(r2Key);
  const buffer = await file.arrayBuffer();
  const blob = new Blob([buffer]);

  // Upload to Immich
  const formData = new FormData();
  formData.append("assetData", blob, filename);
  formData.append("deviceAssetId", `pi-dash-${r2Key}`);
  formData.append("deviceId", "pi-dash");
  formData.append("fileCreatedAt", new Date().toISOString());
  formData.append("fileModifiedAt", new Date().toISOString());

  const uploadRes = await fetch(getImmichUrl("/assets"), {
    method: "POST",
    headers: getImmichHeaders(),
    body: formData,
  });
  if (!uploadRes.ok) {
    throw new Error(
      `Immich upload failed: ${uploadRes.status} ${await uploadRes.text()}`
    );
  }
  const uploadData = (await uploadRes.json()) as { id: string };
  const assetId = uploadData.id;

  // Add to album
  const albumRes = await fetch(getImmichUrl(`/albums/${albumId}/assets`), {
    method: "PUT",
    headers: {
      ...getImmichHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: [assetId] }),
  });
  if (!albumRes.ok) {
    throw new Error(
      `Immich addToAlbum failed: ${albumRes.status} ${await albumRes.text()}`
    );
  }

  return assetId;
}

export async function deleteImmichAsset(assetId: string): Promise<void> {
  const res = await fetch(getImmichUrl("/assets"), {
    method: "DELETE",
    headers: {
      ...getImmichHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: [assetId], force: true }),
  });
  if (!res.ok) {
    throw new Error(
      `Immich deleteAsset failed: ${res.status} ${await res.text()}`
    );
  }
}
