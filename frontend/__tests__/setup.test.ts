/**
 * Smoke test: verifies the test infrastructure boots without errors.
 * The MSW server is started in vitest.setup.ts; if it fails to initialize,
 * this file would not be reached.
 */
import { server } from "../vitest.setup";

describe("test infrastructure", () => {
  it("MSW server is initialized", () => {
    expect(server).toBeDefined();
  });

  it("jest-dom matchers are available", () => {
    const el = document.createElement("div");
    el.textContent = "hello";
    document.body.appendChild(el);
    expect(el).toBeInTheDocument();
    document.body.removeChild(el);
  });
});
