import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { type APIRequestContext, test as setup } from "@playwright/test";
import dotenv from "dotenv";

import { KALAKRITI_ACTORS } from "./fixtures/kalakriti-actors";

dotenv.config({
  path: path.resolve(import.meta.dirname, ".env.test"),
  quiet: true,
});

setup.describe.configure({ mode: "serial", timeout: 150_000 });

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL!;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD!;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;
const FINANCE_ADMIN_EMAIL = process.env.FINANCE_ADMIN_EMAIL!;
const FINANCE_ADMIN_PASSWORD = process.env.FINANCE_ADMIN_PASSWORD!;
const VOLUNTEER_EMAIL = process.env.VOLUNTEER_EMAIL!;
const VOLUNTEER_PASSWORD = process.env.VOLUNTEER_PASSWORD!;
const UNORIENTED_VOLUNTEER_EMAIL = process.env.UNORIENTED_VOLUNTEER_EMAIL!;
const UNORIENTED_VOLUNTEER_PASSWORD =
  process.env.UNORIENTED_VOLUNTEER_PASSWORD!;

const superAdminAuthFile = path.resolve(
  import.meta.dirname,
  ".auth/super_admin.json"
);
const adminAuthFile = path.resolve(import.meta.dirname, ".auth/admin.json");
const financeAdminAuthFile = path.resolve(
  import.meta.dirname,
  ".auth/finance_admin.json"
);
const volunteerAuthFile = path.resolve(
  import.meta.dirname,
  ".auth/volunteer.json"
);
const unorientedVolunteerAuthFile = path.resolve(
  import.meta.dirname,
  ".auth/unoriented_volunteer.json"
);

async function authenticate(
  request: APIRequestContext,
  email: string,
  password: string,
  clientIp: string,
  attempt = 0
) {
  const response = await request.post("/api/auth/sign-in/email", {
    data: { email, password },
    // Setup actors represent separate clients. Keep their sign-ins out of the
    // browser login tests' shared localhost rate-limit bucket.
    headers: { "x-forwarded-for": clientIp },
  });
  console.log(`[auth] ${response.status()} POST ${response.url()}`);
  if (response.ok()) {
    return;
  }
  if (response.status() === 429 && attempt < 2) {
    const headers = response.headers();
    const retryAfter = headers["retry-after"] ?? headers["x-retry-after"];
    const seconds = retryAfter === undefined ? Number.NaN : Number(retryAfter);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60) {
      throw new Error(
        "Auth rate limit did not supply a bounded Retry-After delay"
      );
    }
    console.log(
      `[auth] rate limited; server retry delay ${seconds}s; retry ${attempt + 1}/2`
    );
    await delay(Math.ceil(seconds * 1000));
    await authenticate(request, email, password, clientIp, attempt + 1);
    return;
  }
  throw new Error(
    `Authentication failed for ${email} (HTTP ${response.status()})`
  );
}

setup("authenticate as super_admin", async ({ request }) => {
  await authenticate(
    request,
    SUPER_ADMIN_EMAIL,
    SUPER_ADMIN_PASSWORD,
    "192.0.2.1"
  );
  await request.storageState({ path: superAdminAuthFile });
});

setup("authenticate as admin", async ({ request }) => {
  await authenticate(request, ADMIN_EMAIL, ADMIN_PASSWORD, "192.0.2.2");
  await request.storageState({ path: adminAuthFile });
});

setup("authenticate as finance_admin", async ({ request }) => {
  await authenticate(
    request,
    FINANCE_ADMIN_EMAIL,
    FINANCE_ADMIN_PASSWORD,
    "192.0.2.3"
  );
  await request.storageState({ path: financeAdminAuthFile });
});

setup("authenticate as volunteer", async ({ request }) => {
  await authenticate(request, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD, "192.0.2.4");
  await request.storageState({ path: volunteerAuthFile });
});

setup("authenticate as unoriented_volunteer", async ({ request }) => {
  await authenticate(
    request,
    UNORIENTED_VOLUNTEER_EMAIL,
    UNORIENTED_VOLUNTEER_PASSWORD,
    "192.0.2.5"
  );
  await request.storageState({ path: unorientedVolunteerAuthFile });
});

for (const [index, [name, actor]] of Object.entries(
  KALAKRITI_ACTORS
).entries()) {
  if (!("authFile" in actor)) {
    continue;
  }
  setup(`authenticate as Kalakriti ${name}`, async ({ request }) => {
    await authenticate(
      request,
      actor.email,
      actor.password,
      `192.0.2.${index + 6}`
    );
    await request.storageState({
      path: path.resolve(import.meta.dirname, actor.authFile),
    });
  });
}
