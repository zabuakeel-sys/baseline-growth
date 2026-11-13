export type Pricing = { types: { name: string; ratePer1000Cents: number }[]; minimumCents?: number; rangePercent?: number };
export const WEEKS_PER_MONTH: number;
export function quote(rules: Pricing | null | undefined, input: { type: string; sqft: number; visitsPerWeek: number }): { lowCents: number; highCents: number; midCents: number } | null;
export function parsePricingLines(text: string): { types: { name: string; ratePer1000Cents: number }[]; errors: string[] };
export function brief(lead: Record<string, unknown>): string[];
export function openingQuestion(lead: Record<string, unknown>): string;
export function routeLink(addresses: string[], origin?: string): string | null;
export function goalProgress(counts: { calls: number; visits: number; meetings: number }, goals: { calls: number; visits: number; meetings: number }): { calls: number | null; visits: number | null; meetings: number | null };
export function streak(days: Record<string, { calls: number; visits: number; meetings: number }>, goals: { calls: number; visits: number; meetings: number }, today: string): number;
export function lossReasons(lost: { lost_reason?: string }[]): { reason: string; count: number; percent: number }[];
export function funnel(args: {
  leads: { id: number; status: string; touches_sent: number }[];
  activities: { lead_id: number; outcome: string }[];
  meetings: { lead_id: number; status: string }[];
}): { prospects: number; reached: number; conversations: number; meetingsHeld: number; customers: number };
export const OBJECTIONS: { key: string; label: string; words: RegExp }[];
export function detectObjections(text: string): string[];
export function scriptAnswer(script: string, key: string): string;
