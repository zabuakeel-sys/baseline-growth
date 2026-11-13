export type Outcome = 'no_answer' | 'voicemail' | 'gatekeeper' | 'talked' | 'meeting_booked' | 'signed' | 'not_interested' | 'wrong_number';
export type Channel = 'call' | 'visit' | 'email' | 'linkedin';
export const CHANNELS: Record<Channel, string>;
export const OUTCOMES: Record<Outcome, { label: string; status: string | null; conversation: boolean; nextDays: number | null; lost?: string }>;
export function applyOutcome(lead: { status: string }, outcome: string, today: string): { status: string | null; lostReason: string | null; nextActionOn: string | null };
export function scoreboard(args: {
  users: { id: number; name: string }[];
  activities: { user_id: number | null; channel: string; outcome: string }[];
  meetings: { booked_by: number | null; status: string }[];
  customers: { won_by: number | null }[];
}): { userId: number; name: string; calls: number; visits: number; conversations: number; meetingsBooked: number; meetingsHeld: number; customers: number }[];
export function commissions(args: {
  customers: { id: number; won_by: number | null; customer_since: string | null; client_id: number }[];
  revenue: { lead_id: number; month: string; revenue_cents: number; confirmed: boolean }[];
  clients: Record<number, { share_percent: number; share_months: number | null; signup_fee_cents: number }>;
  rates: Record<number, number>;
  inWindow: (startMonth: string, month: string, shareMonths: number | null) => boolean;
  shareFor: (revenueCents: number, sharePercent: number) => number;
  monthOf: (iso: string) => string;
}): { userId: number; earnedCents: number; commissionCents: number }[];
