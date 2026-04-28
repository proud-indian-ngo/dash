import { file as bunFile, Glob } from "bun";

const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
const projectId = process.env.POSTHOG_PROJECT_ID;
const host = process.env.POSTHOG_CLI_HOST || "https://us.posthog.com";

if (!(apiKey && projectId)) {
  console.error("Missing POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID");
  process.exit(1);
}

const buildDir = "apps/web/.output/public";
const endpoint = `${host}/api/environments/${projectId}/error_tracking/symbol_sets/start_upload/`;

const glob = new Glob("**/*.js.map");
const mapFiles = Array.from(glob.scanSync(buildDir));

if (mapFiles.length === 0) {
  console.log("No source map files found");
  process.exit(0);
}

console.log(`Found ${mapFiles.length} source maps to upload`);

let failed = 0;

for (const mapFile of mapFiles) {
  const jsFile = mapFile.replace(/\.map$/, "");
  const file = bunFile(`${buildDir}/${mapFile}`);
  const fileName = mapFile.split("/").pop() ?? mapFile;
  const form = new FormData();
  form.append("ref", jsFile);
  form.append("file", file, fileName);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
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
