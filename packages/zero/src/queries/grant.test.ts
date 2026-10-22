import { describe, expect, it } from "bun:test";

import { utilisationCertificateQueries } from "./grant";

function ctx(permissions: string[]) {
  return { permissions, role: "volunteer", userId: "user-1" };
}

function queryAst(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

const NEVER = '"value":"__never_match__"';

describe("utilisation certificate queries", () => {
  it("list a grant's certificates to finance.view only", () => {
    const list = (permissions: string[]) =>
      queryAst(
        utilisationCertificateQueries.byGrant.fn({
          args: { grantId: "g-1" },
          ctx: ctx(permissions),
        })
      );
    expect(list(["finance.view"])).not.toContain(NEVER);
    expect(list(["events.view_own"])).toContain(NEVER);
  });

  it("open one to finance.view, else only to the trustees who sign it", () => {
    const one = (permissions: string[]) =>
      queryAst(
        utilisationCertificateQueries.byId.fn({
          args: { id: "uc-1" },
          ctx: ctx(permissions),
        })
      );
    // Finance reads it whoever signs; anyone else only as one of its signers.
    expect(one(["finance.view"])).not.toContain('"value":"user-1"');
    const signer = one(["events.view_own"]);
    expect(signer).toContain('"type":"correlatedSubquery"');
    expect(signer).toContain('"value":"user-1"');
    expect(
      queryAst(
        utilisationCertificateQueries.byId.fn({
          args: { id: "uc-1" },
          ctx: undefined as never,
        })
      )
    ).toContain(NEVER);
  });
});
