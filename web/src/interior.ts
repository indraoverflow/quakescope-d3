import { position } from "./earthquake";

export const EARTH_RADIUS_KM = 6371;
export const GLOBE_RADIUS = 100;
export const ENHANCED_DEPTH_FACTOR = 8;

export type DepthScale = "true" | "enhanced";
export type DepthCategory = "Shallow" | "Intermediate" | "Deep" | "Outside modeled range" | "Unavailable";

export function validDepth(depthKm: number): boolean {
  return Number.isFinite(depthKm) && depthKm >= 0 && depthKm <= EARTH_RADIUS_KM;
}

export function depthCategory(depthKm: number): DepthCategory {
  if (!Number.isFinite(depthKm) || depthKm < 0) return "Unavailable";
  if (depthKm <= 70) return "Shallow";
  if (depthKm <= 300) return "Intermediate";
  if (depthKm <= 700) return "Deep";
  return "Outside modeled range";
}

export function visualDepthKm(depthKm: number, scale: DepthScale): number | null {
  if (!validDepth(depthKm)) return null;
  return Math.min(EARTH_RADIUS_KM, depthKm * (scale === "enhanced" ? ENHANCED_DEPTH_FACTOR : 1));
}

export function hypocenterPosition(
  latitude: number,
  longitude: number,
  depthKm: number,
  scale: DepthScale,
): [number, number, number] | null {
  const visualDepth = visualDepthKm(depthKm, scale);
  if (visualDepth === null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const radiusRatio = Math.max(0, 1 - visualDepth / EARTH_RADIUS_KM);
  return position(latitude, longitude).map((component) => component * radiusRatio) as [number, number, number];
}
