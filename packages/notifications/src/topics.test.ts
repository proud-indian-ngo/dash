import { PERMISSIONS } from "@pi-dash/db/permissions";
import { describe, expect, it } from "vitest";
import {
  getTopicChannels,
  TOPIC_CATALOG,
  TOPICS,
  topicSupportsChannel,
} from "./topics";

const topicValues = Object.values(TOPICS);
const permissionIds = new Set(PERMISSIONS.map((p) => p.id));

describe("TOPIC_CATALOG", () => {
  it("has an entry for every TOPICS value", () => {
    const catalogIds = TOPIC_CATALOG.map((t) => t.id);
    for (const topic of topicValues) {
      expect(catalogIds).toContain(topic);
    }
    expect(TOPIC_CATALOG).toHaveLength(topicValues.length);
  });

  it("has unique topic IDs", () => {
    const ids = TOPIC_CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("references only valid permission IDs", () => {
    for (const entry of TOPIC_CATALOG) {
      if (entry.requiredPermission) {
        expect(
          permissionIds.has(entry.requiredPermission),
          `Invalid permission "${entry.requiredPermission}" in topic "${entry.name}"`
        ).toBe(true);
      }
    }
  });

  it("uses the catalog as the canonical supported-channel contract", () => {
    expect(getTopicChannels(TOPICS.KALAKRITI_REGISTRATION)).toEqual([
      "inbox",
      "whatsapp",
    ]);
    expect(topicSupportsChannel(TOPICS.KALAKRITI_SCHEDULE, "email")).toBe(
      false
    );
    expect(getTopicChannels(TOPICS.ACCOUNT)).toEqual([
      "inbox",
      "email",
      "whatsapp",
    ]);
  });
});
