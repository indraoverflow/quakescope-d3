export type BoundaryProperties = {
  name: string;
  plateA: string;
  plateB: string;
  type: string;
  source: string;
};
export type BoundaryPath = BoundaryProperties & {
  id: string;
  points: { lat: number; lng: number; alt: number }[];
};

export type BoundaryPoint = { lat: number; lng: number; alt: number };

type Geometry = { type?: unknown; coordinates?: unknown };
type Feature = { properties?: Record<string, unknown>; geometry?: Geometry };

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const validCoordinate = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === "number" &&
  Number.isFinite(value[0]) &&
  value[0] >= -180 &&
  value[0] <= 180 &&
  typeof value[1] === "number" &&
  Number.isFinite(value[1]) &&
  value[1] >= -90 &&
  value[1] <= 90;

/**
 * Split a line at the date line so a renderer never connects a boundary across
 * the long side of the globe. Seam points are interpolated on both sides.
 */
export function segmentAntimeridian(points: BoundaryPoint[]): BoundaryPoint[][] {
  if (points.length < 2) return [];
  const segments: BoundaryPoint[][] = [[points[0]]];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const delta = current.lng - previous.lng;
    if (Math.abs(delta) <= 180) {
      segments.at(-1)!.push(current);
      continue;
    }
    const adjustedLng = current.lng + (delta > 180 ? -360 : 360);
    const seam = adjustedLng > previous.lng ? 180 : -180;
    const ratio = (seam - previous.lng) / (adjustedLng - previous.lng);
    const latitude = previous.lat + (current.lat - previous.lat) * ratio;
    segments.at(-1)!.push({ lat: latitude, lng: seam, alt: previous.alt });
    const oppositeSeam = seam === 180 ? -180 : 180;
    segments.push([
      { lat: latitude, lng: oppositeSeam, alt: current.alt },
      current,
    ]);
  }
  return segments.filter((segment) => segment.length >= 2);
}

/** Convert PB2002 GeoJSON into paths understood by the existing globe renderer. */
export function parseBoundaries(input: unknown): BoundaryPath[] {
  const features =
    typeof input === "object" &&
    input !== null &&
    Array.isArray((input as { features?: unknown }).features)
      ? (input as { features: Feature[] }).features
      : [];
  const paths: BoundaryPath[] = [];
  features.forEach((feature, featureIndex) => {
    const geometry = feature?.geometry;
    const lines =
      geometry?.type === "LineString"
        ? [geometry.coordinates]
        : geometry?.type === "MultiLineString" &&
            Array.isArray(geometry.coordinates)
          ? geometry.coordinates
          : [];
    const properties = feature?.properties ?? {};
    const metadata = {
      name: text(properties.Name),
      plateA: text(properties.PlateA),
      plateB: text(properties.PlateB),
      type: text(properties.Type),
      source: text(properties.Source),
    };
    lines.forEach((line, lineIndex) => {
      if (!Array.isArray(line)) return;
      const points = line
        .filter(validCoordinate)
        .map(([lng, lat]) => ({ lat, lng, alt: 0.004 }));
      segmentAntimeridian(points).forEach((segment, segmentIndex) =>
        paths.push({
          ...metadata,
          id: `pb2002-${featureIndex}-${lineIndex}-${segmentIndex}`,
          points: segment,
        }),
      );
    });
  });
  return paths;
}

let cached: Promise<BoundaryPath[]> | undefined;
export function loadBoundaries() {
  cached ??= fetch("/data/pb2002/PB2002_boundaries.json")
    .then((response) => {
      if (!response.ok) throw new Error(`PB2002 returned ${response.status}`);
      return response.json();
    })
    .then(parseBoundaries);
  return cached;
}
