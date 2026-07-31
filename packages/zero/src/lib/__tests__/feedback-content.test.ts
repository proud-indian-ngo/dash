import { describe, expect, it } from "vitest";
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
