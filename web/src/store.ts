import { create } from "zustand";
import type { Event } from "./earthquake";
import type { BoundaryPath } from "./tectonics";
type State = {
  source: string;
  timeRange: string;
  minMagnitude: number;
  autoRotate: boolean;
  tectonicPlates: boolean;
  tectonicError: string | null;
  selected: Event | null;
  selectedBoundary: BoundaryPath | null;
  reset: number;
};
export const useExplorer = create<State & { set: (v: Partial<State>) => void }>(
  (set) => ({
    source: "usgs",
    timeRange: "24h",
    minMagnitude: 2.5,
    autoRotate: true,
    tectonicPlates: true,
    tectonicError: null,
    selected: null,
    selectedBoundary: null,
    reset: 0,
    set,
  }),
);
