import { describe, expect, it, mock } from "bun:test";

import { type JobStatus, watchJob } from "@signr/browser";

mock.module("@/functions/signing", () => ({
  getMyDscStatus: null,
  getSigningJobStatus: null,
  startDscCertificateSigningFn: null,
  startDscDeclarationSigningFn: null,
  startDscEnrolmentFn: null,
  startDscMinutesSigningFn: null,
  startDscSigningFn: null,
}));
const { helperJobWatch } = await import("./dsc-sign-section");

describe("helperJobWatch", () => {
  it("clears the helper prompt as soon as the helper claims the job", async () => {
    const states: JobStatus["state"][] = [
      ...Array<JobStatus["state"]>(5).fill("pending"),
      "claimed",
      "completed",
    ];
    const prompts: boolean[] = [];
    const status = await watchJob({
      ...helperJobWatch(
        async () => ({ state: states.shift() ?? "completed" }),
        new AbortController().signal,
        (notClaimed) => prompts.push(notClaimed)
      ),
      claimTimeoutMs: 15,
      intervalMs: 10,
    });
    expect(status.state).toBe("completed");
    expect(prompts).toEqual([true, false, false]);
  });
});
