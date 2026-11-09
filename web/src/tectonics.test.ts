import { expect, test } from "vitest";
import pb2002 from "../public/data/pb2002/PB2002_boundaries.json";
import { parseBoundaries, segmentAntimeridian } from "./tectonics";

test("parses line and multiline boundaries while retaining available metadata", () => {
  const paths = parseBoundaries({
    features: [
      {
        properties: {
          Name: "AA-BB",
          PlateA: "AA",
          PlateB: "BB",
          Type: "subduction",
          Source: "survey",
        },
        geometry: {
          type: "LineString",
          coordinates: [
            [179, 10],
            [-179, 11],
          ],
        },
      },
      {
        properties: { Name: "CC-DD" },
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [
              [0, 90],
              [1, 89],
            ],
            [
              [2, 3],
              [4, 5],
            ],
          ],
        },
      },
    ],
  });
  expect(paths).toHaveLength(4);
  expect(paths[0]).toMatchObject({
    name: "AA-BB",
    plateA: "AA",
    plateB: "BB",
    type: "subduction",
    source: "survey",
  });
  expect(paths[0].points).toEqual([
    { lng: 179, lat: 10, alt: 0.004 },
    { lng: 180, lat: 10.5, alt: 0.004 },
  ]);
});

test("segments antimeridian crossings without losing spherical endpoints", () => {
  const segments = segmentAntimeridian([
    { lng: 170, lat: 0, alt: 0.004 },
    { lng: -170, lat: 10, alt: 0.004 },
  ]);
  expect(segments).toEqual([
    [
      { lng: 170, lat: 0, alt: 0.004 },
      { lng: 180, lat: 5, alt: 0.004 },
    ],
    [
      { lng: -180, lat: 5, alt: 0.004 },
      { lng: -170, lat: 10, alt: 0.004 },
    ],
  ]);
});

test("bundled PB2002 snapshot covers recognizable tectonic regions", () => {
  const paths = parseBoundaries(pb2002);
  const containsPoint = (
    west: number,
    east: number,
    south: number,
    north: number,
  ) =>
    paths.some((path) =>
      path.points.some(
        ({ lng, lat }) =>
          lng >= west && lng <= east && lat >= south && lat <= north,
      ),
    );
  expect(containsPoint(90, 125, -15, 10)).toBe(true); // Sunda / Sumatra–Java
  expect(containsPoint(-45, 10, -60, 70)).toBe(true); // Mid-Atlantic Ridge
  expect(containsPoint(125, 150, 25, 50)).toBe(true); // Japan region
  expect(containsPoint(-125, -114, 30, 42)).toBe(true); // San Andreas region
});

test("ignores unsupported geometry and malformed coordinates safely", () => {
  expect(
    parseBoundaries({
      features: [
        { geometry: { type: "Polygon", coordinates: [] } },
        {
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [181, 0],
              [1, 91],
              ["x", 2],
            ],
          },
        },
      ],
    }),
  ).toEqual([]);
});
