import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db", () => ({ db: {} }));
mock.module("@pi-dash/env/server", () => ({ env: {} }));

const { createPublicEventsDeployCheck, postWebsiteDispatch } =
  await import("./sync-public-events-deploy");

// Only the identity of the feed matters to the check.
const event = (id: string) => ({ id }) as never;

function setup({ token = "github-token" as string | undefined } = {}) {
  let events = [event("a")];
  const postHook = mock(async () => new Response(null, { status: 200 }));
  const check = createPublicEventsDeployCheck({
    fetchEvents: async () => events,
    postHook,
    token,
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
  it("does nothing without a dispatch token", async () => {
    const { check, postHook } = setup({ token: "" });
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
    expect(postHook).toHaveBeenCalledWith("github-token");
  });

  it("retries on the next run when the dispatch fails", async () => {
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

describe("postWebsiteDispatch", () => {
  it("sends the events-changed repository_dispatch to the website repo", async () => {
    const fetchImpl = mock(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 204 })
    );

    const response = await postWebsiteDispatch(
      "github-token",
      fetchImpl as unknown as typeof fetch
    );

    expect(response.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://api.github.com/repos/proud-indian-ngo/website/dispatches"
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      accept: "application/vnd.github+json",
      authorization: "Bearer github-token",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    });
    expect(init?.body).toBe('{"event_type":"events-changed"}');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
