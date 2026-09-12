import { expect, it } from "bun:test";

import { registrationCleanup } from "./registration-cleanup";

it("attempts every cleanup task and annotates secondary errors", async () => {
  const calls: string[] = [];
  const info = { annotations: [] as { type: string; description?: string }[] };
  await registrationCleanup(
    [
      async () => {
        calls.push("browser");
        throw new Error("browser closed");
      },
      async () => {
        calls.push("media");
        throw new Error("media cleanup failed");
      },
      async () => {
        calls.push("database");
      },
    ],
    true,
    info
  );
  expect(calls).toEqual(["browser", "media", "database"]);
  expect(info.annotations.map((item) => item.description)).toEqual([
    "browser closed",
    "media cleanup failed",
  ]);
});
it("preserves the original assertion when cleanup also fails", async () => {
  const original = new Error("original assertion");
  const operation = async () => {
    let primaryFailed = false;
    try {
      throw original;
    } catch (error) {
      primaryFailed = true;
      throw error;
    } finally {
      await registrationCleanup(
        [
          async () => {
            throw new Error("secondary");
          },
        ],
        primaryFailed,
        { annotations: [] }
      );
    }
  };
  await expect(operation()).rejects.toBe(original);
});
it("fails an otherwise successful test when cleanup fails, after attempting the rest", async () => {
  let databaseCleaned = false;
  const failure = new Error("cleanup failed");
  const operation = registrationCleanup(
    [
      async () => {
        throw failure;
      },
      async () => {
        databaseCleaned = true;
      },
    ],
    false,
    { annotations: [] }
  );
  await expect(operation).rejects.toBeInstanceOf(AggregateError);
  expect(databaseCleaned).toBe(true);
});
