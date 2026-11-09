import { test, expect } from "vitest";
import { useExplorer } from "./store";
test("filter changes and accessible selection share state", () => {
  useExplorer
    .getState()
    .set({ source: "bmkg", timeRange: "7d", minMagnitude: 6 });
  expect(useExplorer.getState().source).toBe("bmkg");
  expect(useExplorer.getState().minMagnitude).toBe(6);
  useExplorer.getState().set({
    selected: {
      id: "test",
      source: "bmkg",
      sourceId: "test",
      latitude: -6,
      longitude: 110,
      magnitude: 6,
      depthKm: 10,
      location: "Test fixture",
      occurredAt: "2026-11-08T00:00:00Z",
    },
  });
  expect(useExplorer.getState().selected?.id).toBe("test");
  useExplorer.getState().set({ selected: null });
  expect(useExplorer.getState().selected).toBeNull();
});
test("tectonic layer visibility is interaction state", () => {
  useExplorer.getState().set({ tectonicPlates: false });
  expect(useExplorer.getState().tectonicPlates).toBe(false);
  useExplorer.getState().set({ tectonicPlates: true });
});
test("tectonic selection does not alter earthquake filters or selection", () => {
  const before = useExplorer.getState();
  useExplorer.getState().set({
    selectedBoundary: {
      id: "boundary",
      name: "AA-BB",
      plateA: "AA",
      plateB: "BB",
      type: "",
      source: "PB2002",
      points: [],
    },
  });
  const after = useExplorer.getState();
  expect(after.source).toBe(before.source);
  expect(after.timeRange).toBe(before.timeRange);
  expect(after.minMagnitude).toBe(before.minMagnitude);
  expect(after.selected).toBe(before.selected);
  expect(after.selectedBoundary?.id).toBe("boundary");
  useExplorer.getState().set({ selectedBoundary: null });
});
