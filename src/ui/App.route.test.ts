import { describe, expect, it } from "vitest";
import { parseRouteFromHash, routeToHash, shouldUseTenFootLayout, type RouteState } from "./App";

describe("App route hash", () => {
  it("supports present mode parsing", () => {
    expect(parseRouteFromHash("#/docs/doc_123/present")).toEqual({
      page: "detail",
      docId: "doc_123",
      mode: "present"
    });
  });

  it("falls back to view mode for unknown suffix", () => {
    expect(parseRouteFromHash("#/docs/doc_123/unknown")).toEqual({
      page: "detail",
      docId: "doc_123",
      mode: "view"
    });
  });

  it("encodes present route to hash", () => {
    const route: RouteState = { page: "detail", docId: "doc_123", mode: "present" };
    expect(routeToHash(route)).toBe("#/docs/doc_123/present");
  });

  it("keeps doc id encode/decode symmetry", () => {
    const route: RouteState = { page: "detail", docId: "doc A/B", mode: "present" };
    const hash = routeToHash(route);
    expect(parseRouteFromHash(hash)).toEqual(route);
  });

  it("enables 10ft mode only on large viewport", () => {
    expect(shouldUseTenFootLayout(1920, 1080)).toBe(true);
    expect(shouldUseTenFootLayout(1440, 900)).toBe(true);
    expect(shouldUseTenFootLayout(1366, 768)).toBe(false);
  });
});
