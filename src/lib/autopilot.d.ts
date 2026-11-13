export const REFRESH_DAYS: number;
export const AUTO_ADD_SCORE: number;
export function dueTarget<T extends { id: number; last_run_at: string | null }>(targets: T[], today: string, refreshDays?: number): T | null;
export function prospectsToAdd(a: { dailyCap: number; addedToday: number; untouched: number }): number;
export function pickRep(repIds: number[], openCounts: Record<number, number>): number | null;
export function autoAddable<T extends { id: number; score: number; email: string; phone: string }>(candidates: T[], minScore?: number): T[];
