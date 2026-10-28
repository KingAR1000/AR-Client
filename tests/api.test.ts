import { describe, it, expect } from "vitest";
import { loaderChoices, message, request } from "../src/api";
describe("catalog loader responses", () => {
  it("normalizes real Fabric metadata and Maven version lists", () => {
    expect(
      loaderChoices([{ loader: { version: "0.17.2" } }, { broken: true }]),
    ).toEqual(["0.17.2"]);
    expect(loaderChoices(["21.9.0", "21.9.1"])).toEqual(["21.9.0", "21.9.1"]);
  });
  it("handles unavailable loader metadata", () =>
    expect(loaderChoices(null)).toEqual([]));
});
describe("desktop boundary", () => {
  it("rejects backend operations in a browser instead of simulating success", async () => {
    await expect(request("launch", { id: "test" })).rejects.toThrow("desktop");
  });
  it("preserves backend errors", () =>
    expect(message(new Error("Checksum mismatch"))).toBe("Checksum mismatch"));
});
