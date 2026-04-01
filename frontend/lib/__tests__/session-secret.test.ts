import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_SECRET = process.env.SESSION_COOKIE_SECRET;

async function importHelper() {
  vi.resetModules();
  return import("../session-secret");
}

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.SESSION_COOKIE_SECRET;
  } else {
    process.env.SESSION_COOKIE_SECRET = ORIGINAL_SECRET;
  }
});

describe("getSessionSecret", () => {
  it("returns configured secret when present", async () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_COOKIE_SECRET = "super-secret";

    const { getSessionSecret } = await importHelper();

    expect(getSessionSecret()).toBe("super-secret");
  });

  it("uses the local fallback in development", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.SESSION_COOKIE_SECRET;

    const { getSessionSecret } = await importHelper();

    expect(getSessionSecret()).toBe("local-dev-session-secret");
  });

  it("throws outside development and test when the secret is missing", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.SESSION_COOKIE_SECRET;

    const { getSessionSecret } = await importHelper();

    expect(() => getSessionSecret()).toThrow(/SESSION_COOKIE_SECRET must be set/i);
  });
});
