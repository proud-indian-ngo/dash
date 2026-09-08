import { describe, expect, it } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { PersonQrPanel } from "./person-qr-panel";

describe("Person QR panel", () => {
  it("renders an accessible identifier QR without issuance controls", () => {
    const html = renderToStaticMarkup(
      <PersonQrPanel id="membership-one" type="volunteer" />
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Person QR code"');
    expect(html).not.toContain("membership-one");
    expect(html).toContain("<svg");
    expect(html).not.toContain("<button");
  });

  it("keeps the QR stable on reopen and changes it for another identifier", () => {
    const render = (
      id: string,
      type: "student" | "guardian" | "volunteer" = "volunteer"
    ) => renderToStaticMarkup(<PersonQrPanel id={id} type={type} />);
    expect(render("membership-one", "guardian")).not.toBe(
      render("membership-one", "volunteer")
    );
    expect(render("membership-one")).toBe(render("membership-one"));
    expect(render("membership-one")).not.toBe(render("membership-two"));
  });

  it("does not render while the sheet is closed", () => {
    expect(
      renderToStaticMarkup(
        <PersonQrPanel enabled={false} id="membership-one" type="volunteer" />
      )
    ).toBe("");
  });
});
