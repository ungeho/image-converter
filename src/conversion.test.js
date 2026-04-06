import { describe, expect, it } from "vitest";
import { DEFAULT_TRANSFORM, getFinalTargetSize, getTargetSize, getOutputName } from "./conversion";

describe("conversion helpers", () => {
  it("keeps image within contain bounds", () => {
    expect(getTargetSize(2000, 1000, { enabled: true, mode: "contain", keepAspect: true, width: "1000", height: "1000" })).toEqual({
      width: 1000,
      height: 500,
    });
  });

  it("supports long-edge resize mode", () => {
    expect(getTargetSize(2000, 1000, { enabled: true, mode: "long-edge", keepAspect: true, width: "800", height: "" })).toEqual({
      width: 800,
      height: 400,
    });
  });

  it("accounts for rotation in final target size", () => {
    expect(getFinalTargetSize(1600, 900, 1, { ...DEFAULT_TRANSFORM, rotation: 90 }, { enabled: true, mode: "contain", keepAspect: true, width: "800", height: "800" })).toEqual({
      width: 450,
      height: 800,
    });
  });

  it("creates output names with new extension", () => {
    expect(getOutputName("sample.photo.png", "webp")).toBe("sample.photo.webp");
  });
});
