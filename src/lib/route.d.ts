export type Point = { lat: number; lng: number };
export function haversine(a: Point, b: Point): number;
export function orderByNearest<T extends { lat?: number | null; lng?: number | null }>(origin: Point | null, stops: T[]): T[];
