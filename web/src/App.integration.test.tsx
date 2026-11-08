// @vitest-environment jsdom
import {afterEach, expect, test, vi} from "vitest";
import {act} from "react";
import {createRoot, type Root} from "react-dom/client";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import App from "./App";
import {useExplorer} from "./store";

// WebGL is outside this DOM integration test; real App/query/store wiring remains.
vi.mock("./Scene", () => ({default: () => null}));
let root: Root | undefined;
afterEach(async () => {if (root) await act(async () => root!.unmount()); document.body.innerHTML=""; vi.unstubAllGlobals();});

test("API results support DOM selection and filter requests", async () => {
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
 useExplorer.setState({source:"usgs",timeRange:"24h",minMagnitude:2.5,selected:null});
 const calls: string[]=[];
 vi.stubGlobal("fetch", async (url:string) => {
  calls.push(url);
  return {ok:true,json:async()=>({events:[{id:"usgs:fixture",source:"usgs",sourceId:"fixture",latitude:-5,longitude:118,magnitude:5.2,depthKm:12,location:"Fixture epicenter",occurredAt:"2026-11-08T00:00:00Z"}],total:1,returned:1,truncated:false,freshness:[]})};
 });
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 const container=document.createElement("div");document.body.append(container);root=createRoot(container);
 await act(async()=>{root!.render(<QueryClientProvider client={client}><App/></QueryClientProvider>);});
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});
 const buttons=()=>Array.from(container.querySelectorAll("button"));
 const event=buttons().find(b=>b.textContent?.includes("Fixture epicenter"));
 expect(event).toBeDefined();
 await act(async()=>event!.click());
 expect(container.querySelector('[aria-label="Earthquake details"]')?.textContent).toContain("12 km");
 expect(event!.getAttribute("aria-pressed")).toBe("true");
 await act(async()=>buttons().find(b=>b.textContent==="Past 7 days")!.click());
 expect(calls.some(url=>url.includes("timeRange=7d"))).toBe(true);
 expect(container.querySelector('[aria-label="Earthquake details"]')).toBeNull();
 await act(async()=>buttons().find(b=>b.textContent==="BMKG")!.click());
 expect(calls.some(url=>url.includes("source=bmkg"))).toBe(true);
 client.clear();
});
