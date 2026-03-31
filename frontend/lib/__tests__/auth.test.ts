import { describe, it, expect, beforeEach } from "vitest";
import {
  storeTokens,
  getRefreshToken,
  getAccessToken,
  setAccessToken,
  clearTokens,
  setSessionCookie,
  setOnboardedCookie,
  clearSessionCookie,
} from "../auth";

describe("auth storage helpers", () => {
  beforeEach(() => {
    clearTokens();  // resets in-memory _accessToken AND removes localStorage entries
    localStorage.clear();
    document.cookie = "overload-session=; max-age=0; path=/";
    document.cookie = "overload-onboarded=; max-age=0; path=/";
  });

  it("stores and retrieves refresh token from localStorage", () => {
    storeTokens("acc123", "ref456");
    expect(getRefreshToken()).toBe("ref456");
  });

  it("getAccessToken returns null before tokens are stored", () => {
    expect(getAccessToken()).toBeNull();
  });

  it("storeTokens sets in-memory access token", () => {
    storeTokens("mytoken", "myrefresh");
    expect(getAccessToken()).toBe("mytoken");
  });

  it("setAccessToken updates in-memory token", () => {
    setAccessToken("newtoken");
    expect(getAccessToken()).toBe("newtoken");
  });

  it("clearTokens removes stored tokens and resets memory", () => {
    storeTokens("acc", "ref");
    clearTokens();
    expect(getRefreshToken()).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it("setSessionCookie sets overload-session cookie", async () => {
    await setSessionCookie();
    expect(document.cookie).toContain("overload-session=1");
  });

  it("setOnboardedCookie sets overload-onboarded cookie", async () => {
    await setOnboardedCookie();
    expect(document.cookie).toContain("overload-onboarded=1");
  });

  it("clearSessionCookie removes both cookies", async () => {
    await setSessionCookie();
    await setOnboardedCookie();
    await clearSessionCookie();
    expect(document.cookie).not.toContain("overload-session=1");
    expect(document.cookie).not.toContain("overload-onboarded=1");
  });
});
