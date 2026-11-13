export type StatementRow = {
  month: string; feeCents: number; signups: number; signupCents: number; shareCents: number; waitingCents: number;
  dueCents: number; paidCents: number; balanceCents: number; dueDate: string;
  status: 'paid' | 'open' | 'late' | 'upcoming';
};
export function monthOf(isoDate: string): string;
export function addMonths(month: string, n: number): string;
export function monthsBetween(a: string, b: string): number;
export function dueDateOf(month: string): string;
export function inShareWindow(startMonth: string, month: string, shareMonths: number | null): boolean;
export function shareCents(revenueCents: number, sharePercent: number): number;
export function statement(args: {
  client: { monthly_fee_cents: number; share_percent: number; share_months: number | null; signup_fee_cents: number; contract_start: string | null; contract_end: string | null };
  customers: { id: number; customer_since: string | null }[];
  revenue: { lead_id: number; month: string; revenue_cents: number; confirmed: boolean }[];
  payments: { month: string; amount_cents: number }[];
  today: string;
}): StatementRow[];
