import { describe, expect, it } from "vitest";
import type { Event } from "./earthquake";
import { advanceTime, rangeForPreset, sortChronologically, visibleEventCount } from "./timeline";
const event = (id: string, occurredAt: string) => ({ id, occurredAt } as Event);
describe("timeline", () => {
  it("sorts stably by timestamp and id and finds visible events", () => {
    const events = sortChronologically([event("b", "2026-01-01T00:00:02Z"), event("z", "2026-01-01T00:00:01Z"), event("a", "2026-01-01T00:00:02Z")]);
    expect(events.map((e) => e.id)).toEqual(["z", "a", "b"]);
    expect(visibleEventCount(events, "2026-01-01T00:00:02Z")).toBe(3);
    expect(visibleEventCount(events, "2026-01-01T00:00:01.500Z")).toBe(1);
  });
  it("advances independently of frame size, speed, and stops at the end", () => {
    const start = "2026-01-01T00:00:00Z", end = "2026-01-02T00:00:00Z";
    expect(advanceTime(start, start, end, 1, 60_000).currentTime).toBe("2026-01-01T12:00:00.000Z");
    expect(advanceTime(start, start, end, 5, 120_000).complete).toBe(true);
  });
  it("builds UTC presets with safer magnitude defaults", () => {
    const r = rangeForPreset("30d", new Date("2026-02-01T00:00:00Z"));
    expect(r.startTime).toBe("2026-01-02T00:00:00.000Z");
    expect(r.minMagnitude).toBe(4.5);
  });
});
