import {create} from "zustand";
import type {Event} from "./earthquake";
export const useExplorer=create<{source:string;timeRange:string;minMagnitude:number;autoRotate:boolean;selected:Event|null;reset:number;set:(v:Partial<{source:string;timeRange:string;minMagnitude:number;autoRotate:boolean;selected:Event|null;reset:number}>)=>void}>(set=>({source:"usgs",timeRange:"24h",minMagnitude:2.5,autoRotate:true,selected:null,reset:0,set}));
