/**
 * A stand-in for the GoWA gateway, so E2E runs have WhatsApp configured
 * without sending anything. It answers the endpoints in
 * packages/whatsapp/src with the fields that client reads; anything else
 * is a 404, so a new endpoint fails loudly instead of passing silently.
 *
 * Each group list holds one new group, so concurrent picker tests never
 * pick the same one. Status checks report nobody on WhatsApp and invite
 * links are absent, as when the gateway isn't configured.
 *
 * A send to a phone or group JID containing `gowa-fail` is refused with a
 * 500, so a spec can make delivery fail for chosen recipients.
 */
const port = Number(process.env.E2E_GOWA_PORT);
if (!port) {
  throw new Error("E2E_GOWA_PORT is required");
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `e2e-fake-${Date.now()}-${counter}`;
}

const ok = (results: unknown) =>
  Response.json({ code: "SUCCESS", message: "Success", results });

const FAIL_MARKER = "gowa-fail";

/** Accepts the send unless its `phone` (a number or group JID) is marked to fail. */
async function send(request: Request): Promise<Response> {
  const isJson = request.headers
    .get("content-type")
    ?.includes("application/json");
  const phone = isJson
    ? (await request.json()).phone
    : (await request.formData()).get("phone");
  if (typeof phone === "string" && phone.includes(FAIL_MARKER)) {
    return new Response("fake GoWA: send refused", { status: 500 });
  }
  return ok({ message_id: nextId(), status: "sent" });
}

Bun.serve({
  port,
  routes: {
    "/group": { POST: () => ok({ group_id: `${nextId()}@g.us` }) },
    "/group/info": { GET: () => ok({ Participants: [] }) },
    "/group/invite-link": { GET: () => ok({}) },
    "/group/participants": { POST: () => ok([]) },
    "/group/participants/remove": { POST: () => ok([]) },
    "/health": () => new Response("ok"),
    "/send/file": { POST: send },
    "/send/image": { POST: send },
    "/send/message": { POST: send },
    "/send/poll": { POST: send },
    "/send/video": { POST: send },
    "/user/check": { GET: () => ok({ is_on_whatsapp: false }) },
    "/user/my/groups": {
      GET: () => {
        const id = nextId();
        return ok({
          data: [
            { JID: `${id}@g.us`, Name: `E2E group ${id}`, Participants: [] },
          ],
        });
      },
    },
  },
  fetch: (request) => {
    console.error(`fake GoWA: no handler for ${request.method} ${request.url}`);
    return new Response("Not found", { status: 404 });
  },
});

console.log(`fake GoWA listening on ${port}`);
