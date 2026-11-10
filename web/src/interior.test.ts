import { describe, expect, test } from "vitest";
import { depthCategory, EARTH_RADIUS_KM, ENHANCED_DEPTH_FACTOR, hypocenterPosition, visualDepthKm } from "./interior";
import { position } from "./earthquake";

describe("earth interior coordinates", () => {
  test("true scale uses the Earth radius ratio and existing axes", () => {
    const depth = 637.1;
    const surface = position(12, 140);
    const inside = hypocenterPosition(12, 140, depth, "true")!;
    expect(inside).toEqual(surface.map((v) => expect.closeTo(v * 0.9, 8)));
  });
  test("enhancement changes visualization only and remains inside Earth", () => {
    expect(visualDepthKm(10, "enhanced")).toBe(10 * ENHANCED_DEPTH_FACTOR);
    const center = hypocenterPosition(0, 0, EARTH_RADIUS_KM, "enhanced")!;
    expect(center).toEqual([0, 0, 0]);
  });
  test.each([[-1], [Number.NaN], [EARTH_RADIUS_KM + 1]])("rejects invalid depth %s", (depth) => {
    expect(hypocenterPosition(0, 0, depth, "true")).toBeNull();
  });
});

test("depth categories preserve published thresholds", () => {
  expect(depthCategory(0)).toBe("Shallow");
  expect(depthCategory(70)).toBe("Shallow");
  expect(depthCategory(70.1)).toBe("Intermediate");
  expect(depthCategory(300)).toBe("Intermediate");
  expect(depthCategory(300.1)).toBe("Deep");
  expect(depthCategory(701)).toBe("Outside modeled range");
  expect(depthCategory(-2)).toBe("Unavailable");
});
