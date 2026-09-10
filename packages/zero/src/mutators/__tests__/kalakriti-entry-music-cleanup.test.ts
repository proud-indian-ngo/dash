import { expect, it, mock } from "bun:test";

import type { Context } from "../../context";
import { enqueueEntryMusicCleanup } from "../kalakriti-entry-music-cleanup";
import type { LockableKalakritiTx } from "../kalakriti-row-locks";

it("queues reference-checked cleanup for every child when its Entry is removed", async () => {
  const enqueue = mock();
  const asyncTasks: NonNullable<Context["asyncTasks"]> = [];
  const keys = [
    "app/kalakriti-music/edition/entry/one.mp3",
    "app/kalakriti-music/edition/entry/two.m4a",
  ];
  await enqueueEntryMusicCleanup(
    {
      location: "server",
      run: mock(async () => keys.map((objectKey) => ({ objectKey }))),
    } as unknown as LockableKalakritiTx,
    {
      userId: "user",
      role: "admin",
      permissions: [],
      asyncTasks,
      enqueue,
      r2KeyPrefix: "app",
    },
    "entry",
    "edition"
  );
  expect(asyncTasks).toHaveLength(2);
  await Promise.all(asyncTasks.map((task) => task.fn()));
  for (const r2Key of keys) {
    expect(enqueue).toHaveBeenCalledWith(
      "delete-r2-object",
      expect.objectContaining({ r2Key, mode: "if-unreferenced" }),
      expect.anything()
    );
  }
});
