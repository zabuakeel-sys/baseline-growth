export type StatementRow = {
  month: string; feeCents: number; bonusCents: number; bonusPending: boolean; growthCents: number | null;
  dueCents: number; paidCents: number; balanceCents: number; dueDate: string;
  status: 'paid' | 'open' | 'late' | 'upcoming';
};
export function monthOf(isoDate: string): string;
export function addMonths(month: string, n: number): string;
export function dueDateOf(month: string): string;
export function bonusCents(args: { bonusPercent: number; baselineCents: number | null; revenueCents: number | null }): number;
export function statement(args: {
  client: { monthly_fee_cents: number; bonus_percent: number; contract_start: string | null; contract_end: string | null };
  baseline: { monthly_revenue_cents: number | null; signed_off: boolean } | null;
  results: { month: string; revenue_cents: number; confirmed: boolean }[];
  payments: { month: string; amount_cents: number }[];
  today: string;
}): StatementRow[];
