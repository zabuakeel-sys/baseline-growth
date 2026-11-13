export type LeadStatus = 'new' | 'following_up' | 'talking' | 'won' | 'lost';
export const SCHEDULE_DAYS: number[];
export const SOURCES: string[];
export const STATUSES: Record<LeadStatus, string>;
export const LOST_REASONS: string[];
export function daysBetween(a: string, b: string): number;
export function nextDue(receivedOn: string, touchesSent: number): string | null;
export function isDue(lead: { status: string; received_on: string; touches_sent: number }, today: string): boolean;
export function needsDecision(lead: { status: string; touches_sent: number }): boolean;
export function messageFor(touch: number, ctx: { leadName?: string; clientName: string; need?: string; senderName?: string }): string;
export function leadStats(leads: { status: string; won_value_cents?: number | null; received_at?: string | null; received_on?: string; first_touch_at?: string | null }[]): {
  total: number; won: number; lost: number; open: number; winRate: number | null; wonValueCents: number; avgReplyHours: number | null;
};
