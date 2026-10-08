import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db", () => ({ db: {} }));
mock.module("@pi-dash/env/server", () => ({ env: {} }));

const { createPublicEventsDeployCheck } =
  await import("./sync-public-events-deploy");

// Only the identity of the feed matters to the check.
const event = (id: string) => ({ id }) as never;

function setup({
  hookUrl = "https://hooks.example/deploy" as string | undefined,
} = {}) {
  let events = [event("a")];
  const postHook = mock(async () => new Response(null, { status: 200 }));
  const check = createPublicEventsDeployCheck({
    fetchEvents: async () => events,
    hookUrl,
    postHook,
  });
  return {
    check,
    postHook,
    setEvents: (next: never[]) => {
      events = next;
    },
  };
}

describe("createPublicEventsDeployCheck", () => {
  it("does nothing without a deploy hook", async () => {
    const { check, postHook } = setup({ hookUrl: "" });
    await expect(check()).resolves.toBe("disabled");
    expect(postHook).not.toHaveBeenCalled();
  });

  it("deploys on the first run after a restart, then only on change", async () => {
    const { check, postHook, setEvents } = setup();

    await expect(check()).resolves.toBe("deployed");
    await expect(check()).resolves.toBe("unchanged");
    expect(postHook).toHaveBeenCalledTimes(1);

    setEvents([event("a"), event("b")]);
    await expect(check()).resolves.toBe("deployed");
    await expect(check()).resolves.toBe("unchanged");
    expect(postHook).toHaveBeenCalledTimes(2);
    expect(postHook).toHaveBeenCalledWith("https://hooks.example/deploy");
  });

  it("retries on the next run when the hook fails", async () => {
    const { check, postHook, setEvents } = setup();
    await check();
    setEvents([]);
    postHook.mockImplementationOnce(
      async () => new Response(null, { status: 500 })
    );

    await expect(check()).rejects.toThrow("answered 500");
    await expect(check()).resolves.toBe("deployed");
  });
});
