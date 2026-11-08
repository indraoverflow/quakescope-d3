import {expect,test} from "vitest";
import {depthColor,markerSize,position} from "./earthquake";
test("depth boundaries and magnitude size",()=>{expect(depthColor(69)).toBe("#ffbf69");expect(depthColor(70)).toBe("#ff6d59");expect(depthColor(300)).toBe("#b99bff");expect(markerSize(6)).toBeGreaterThan(markerSize(2.5));});
test("geographic axes align with globe",()=>{expect(position(0,0)).toEqual([0,0,100]);expect(position(90,0)[1]).toBeCloseTo(100);expect(position(0,90)[0]).toBeCloseTo(100);});
