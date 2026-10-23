/**
 * A stand-in for the GoWA gateway, so E2E runs have WhatsApp configured
 * without sending anything. It answers the endpoints in
 * packages/whatsapp/src with the fields that client reads; anything else
 * is a 404, so a new endpoint fails loudly instead of passing silently.
 *
 * Each group list holds one new group, so concurrent picker tests never
 * pick the same one. Status checks report nobody on WhatsApp and invite
 * links are absent, as when the gateway isn't configured.
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

const sent = () => ok({ message_id: nextId(), status: "sent" });

Bun.serve({
  port,
  routes: {
    "/group": { POST: () => ok({ group_id: `${nextId()}@g.us` }) },
    "/group/info": { GET: () => ok({ Participants: [] }) },
    "/group/invite-link": { GET: () => ok({}) },
    "/group/participants": { POST: () => ok([]) },
    "/group/participants/remove": { POST: () => ok([]) },
    "/health": () => new Response("ok"),
    "/send/file": { POST: sent },
    "/send/image": { POST: sent },
    "/send/message": { POST: sent },
    "/send/poll": { POST: sent },
    "/send/video": { POST: sent },
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
