import { describe, expect, it } from "bun:test";

import {
  malformedPlateDocuments,
  validPlateDocuments,
} from "@pi-dash/shared/plate-content.test-fixtures";

import { assertFeedbackContentMediaPolicy } from "../feedback-content";

const plate = (...urls: string[]) =>
  JSON.stringify([
    {
      children: [
        { text: "Feedback" },
        ...urls.map((url) => ({
          children: [{ text: "" }],
          type: "img",
          url,
        })),
      ],
      type: "p",
    },
  ]);

describe("assertFeedbackContentMediaPolicy", () => {
  for (const [name, value] of Object.entries(malformedPlateDocuments)) {
    it(`rejects malformed ${name} nodes`, () => {
      expect(() =>
        assertFeedbackContentMediaPolicy(JSON.stringify(value))
      ).toThrow("Invalid feedback content");
    });
  }

  for (const [name, value] of Object.entries(validPlateDocuments)) {
    it(`preserves valid ${name} content`, () => {
      const content = JSON.stringify(value);
      expect(() =>
        assertFeedbackContentMediaPolicy(content, content)
      ).not.toThrow();
    });
  }

  it("allows valid image-free feedback", () => {
    expect(() => assertFeedbackContentMediaPolicy(plate())).not.toThrow();
  });

  it("rejects images in a new feedback submission", () => {
    expect(() =>
      assertFeedbackContentMediaPolicy(
        plate("/api/media/event-update?eventId=event-1&key=private")
      )
    ).toThrow("Feedback cannot contain new images");
  });

  it("allows existing image references but rejects newly added ones", () => {
    const existingUrl = "/api/media/event-update?eventId=event-1&key=existing";
    expect(() =>
      assertFeedbackContentMediaPolicy(plate(existingUrl), plate(existingUrl))
    ).not.toThrow();
    expect(() =>
      assertFeedbackContentMediaPolicy(
        plate(existingUrl, "app/updates/event-1/new.jpg"),
        plate(existingUrl)
      )
    ).toThrow("Feedback cannot contain new images");
  });

  it("rejects malformed feedback content", () => {
    expect(() => assertFeedbackContentMediaPolicy("{broken")).toThrow(
      "Invalid feedback content"
    );
  });
});
