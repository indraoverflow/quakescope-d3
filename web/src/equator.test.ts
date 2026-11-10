import { describe, expect, test } from "vitest";
import { EQUATOR_ALTITUDE, equatorPoints } from "./equator";

describe("equator geometry", () => {
  test("is a closed, full-circle latitude-zero path", () => {
    const points = equatorPoints(36);
    expect(points).toHaveLength(37);
    expect(points[0]).toEqual(points.at(-1)?.map((value) => expect.closeTo(value, 9)));
    for (const [, y] of points) expect(y).toBeCloseTo(0, 9);
  });
  test("sits consistently just above the globe", () => {
    for (const point of equatorPoints(24)) expect(Math.hypot(...point)).toBeCloseTo(100 * EQUATOR_ALTITUDE, 8);
  });
});
