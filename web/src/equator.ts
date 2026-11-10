import { position } from "./earthquake";

export const EQUATOR_ALTITUDE = 1.006;
export const EQUATOR_SEGMENTS = 180;

/** A closed latitude-zero path using the application's established globe axes. */
export function equatorPoints(segments = EQUATOR_SEGMENTS): [number, number, number][] {
  const count = Math.max(12, Math.floor(segments));
  return Array.from({ length: count + 1 }, (_, index) => {
    const longitude = -180 + (360 * index) / count;
    return position(0, longitude).map((value) => value * EQUATOR_ALTITUDE) as [number, number, number];
  });
}
