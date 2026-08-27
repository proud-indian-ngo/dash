import { describe, expect, it, vi } from "vitest";
import {
  getUserFromSignUpReturned,
  verifyPersistedSignUpUser,
} from "./sign-up-returned";

const user = {
  email: "new@example.com",
  id: "user-1",
  name: "New User",
};

describe("getUserFromSignUpReturned", () => {
  it("reads the Better Auth JSON payload when asResponse is false", () => {
    expect(getUserFromSignUpReturned({ token: null, user })).toEqual(user);
  });

  it("reads a wrapped body payload", () => {
    expect(getUserFromSignUpReturned({ body: { token: null, user } })).toEqual(
      user
    );
  });

  it("reads a bare user object", () => {
    expect(getUserFromSignUpReturned(user)).toEqual(user);
  });

  it("returns undefined when the user id is missing", () => {
    expect(
      getUserFromSignUpReturned({ token: null, user: { email: user.email } })
    ).toBeUndefined();
    expect(
      getUserFromSignUpReturned({ body: { token: null } })
    ).toBeUndefined();
    expect(getUserFromSignUpReturned(undefined)).toBeUndefined();
  });
});

describe("verifyPersistedSignUpUser", () => {
  it("accepts a returned user that matches the database row", async () => {
    const lookup = vi.fn(async () => ({ id: "user-1" }));
    await expect(verifyPersistedSignUpUser(user, lookup)).resolves.toEqual(
      user
    );
  });

  it("rejects synthetic duplicate-email responses", async () => {
    const lookup = vi.fn(async () => ({ id: "existing-user" }));
    await expect(
      verifyPersistedSignUpUser(user, lookup)
    ).resolves.toBeUndefined();
  });

  it("rejects missing email or id", async () => {
    const lookup = vi.fn();
    await expect(
      verifyPersistedSignUpUser({ id: "user-1" }, lookup)
    ).resolves.toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });
});
