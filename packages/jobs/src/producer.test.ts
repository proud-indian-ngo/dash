import { beforeEach, describe, expect, it, mock } from "bun:test";

const start = mock(async () => undefined);
const stop = mock(async () => undefined);
const createQueue = mock(async () => undefined);
const on = mock();
const constructors = mock();
let instance: unknown;

mock.module("pg-boss", () => ({
  PgBoss: class {
    constructor(options: unknown) {
      constructors(options);
    }
    start = start;
    stop = stop;
    createQueue = createQueue;
    on = on;
  },
}));
mock.module("./boss-instance", () => ({
  getBossInstance: () => instance,
  setBossInstance: (value: unknown) => {
    instance = value;
  },
}));

const { startJobProducer } = await import("./producer");

describe("standalone job producer", () => {
  beforeEach(() => {
    instance = undefined;
    mock.clearAllMocks();
    start.mockResolvedValue(undefined);
  });

  it("uses the confirmed database without running handlers, schedules, or migrations", async () => {
    const producer = await startJobProducer("postgres://localhost/test");
    expect(constructors).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: "postgres://localhost/test",
        migrate: false,
        schedule: false,
        supervise: false,
      })
    );
    expect(instance).toBeDefined();
    await producer.createQueue("notify-role-changed");
    expect(createQueue).toHaveBeenCalledWith("notify-role-changed");
    await producer.stop();
    expect(stop).toHaveBeenCalled();
    expect(instance).toBeUndefined();
  });

  it("does not replace a running worker", async () => {
    instance = {};
    await expect(startJobProducer("postgres://localhost/test")).rejects.toThrow(
      "already running"
    );
    expect(start).not.toHaveBeenCalled();
  });

  it("does not publish an unavailable producer", async () => {
    start.mockRejectedValueOnce(new Error("offline"));
    await expect(startJobProducer("postgres://localhost/test")).rejects.toThrow(
      "offline"
    );
    expect(instance).toBeUndefined();
  });
});
