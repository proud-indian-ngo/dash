import { basename, relative } from "node:path";
import { file as bunFile, Glob } from "bun";

const REQUIRED_ENV = [
  "POSTHOG_PERSONAL_API_KEY",
  "POSTHOG_PROJECT_ID",
  "BASE_URL",
] as const;

const env = {
  apiKey: process.env.POSTHOG_PERSONAL_API_KEY ?? "",
  projectId: process.env.POSTHOG_PROJECT_ID ?? "",
  host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
  baseUrl: process.env.BASE_URL?.replace(/\/$/, "") ?? "",
};

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const BUILD_DIR = "apps/web/.output/public";
const ENDPOINT = `${env.host}/api/environments/${env.projectId}/error_tracking/symbol_sets/start_upload/`;

const glob = new Glob("**/*.js.map");
const mapFiles = Array.from(glob.scanSync(BUILD_DIR));

if (mapFiles.length === 0) {
  console.log("No source map files found");
  process.exit(0);
}

console.log(`Found ${mapFiles.length} source maps to upload`);

let failed = 0;

for (const mapFile of mapFiles) {
  const jsFile = mapFile.replace(/\.map$/, "");
  const publicPath = relative(".", `${BUILD_DIR}/${jsFile}`).replace(
    /^apps\/web\/\.output\/public\//,
    ""
  );
  const minifiedUrl = `${env.baseUrl}/${publicPath}`;

  const file = bunFile(`${BUILD_DIR}/${mapFile}`);
  const form = new FormData();
  form.append("ref", minifiedUrl);
  form.append("file", file, basename(mapFile));

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.apiKey}` },
      body: form,
    });

    if (res.ok) {
      console.log(`  ✓ ${jsFile}`);
    } else {
      const body = await res.text();
      console.error(`  ✗ ${jsFile} — ${res.status}: ${body}`);
      failed++;
    }
  } catch (err) {
    console.error(`  ✗ ${jsFile} — ${err}`);
    failed++;
  }
}

console.log(
  `\nUploaded ${mapFiles.length - failed}/${mapFiles.length} source maps`
);

if (failed > 0) {
  process.exit(1);
}
