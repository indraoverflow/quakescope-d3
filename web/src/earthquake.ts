export type Event = {id:string;source:string;sourceId:string;latitude:number;longitude:number;magnitude:number;depthKm:number;location:string;occurredAt:string;updatedAt?:string;felt?:string;tsunamiInformation?:string;detailUrl?:string};
export type Status = {source:string;lastSuccessfulSync?:string;lastAttemptedSync?:string;stale:boolean;error?:string};
export const depthColor=(depth:number)=>depth<70?"#ffbf69":depth<300?"#ff6d59":"#b99bff";
export const markerSize=(m:number)=>Math.max(.25,Math.min(1.6,m*m*.025));
export function position(lat:number,lng:number):[number,number,number]{const a=lat*Math.PI/180,b=lng*Math.PI/180;return [100*Math.cos(a)*Math.sin(b),100*Math.sin(a),100*Math.cos(a)*Math.cos(b)];}
