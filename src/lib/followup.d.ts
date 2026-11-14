export type LeadStatus = 'new' | 'following_up' | 'talking' | 'introduced' | 'won' | 'lost' | 'opted_out';
export const SCHEDULE_DAYS: number[];
export const SOURCES: string[];
export const STATUSES: Record<LeadStatus, string>;
export const LOST_REASONS: string[];
export function daysBetween(a: string, b: string): number;
export function nextDue(addedOn: string, touchesSent: number): string | null;
export function isDue(lead: { status: string; received_on: string; touches_sent: number }, today: string): boolean;
export function needsDecision(lead: { status: string; touches_sent: number }): boolean;
export function messageFor(touch: number, ctx: {
  leadName?: string; clientName: string; offer?: string; need?: string; senderName?: string; address?: string; personal?: string;
}): string;
export function signOff(ctx: { clientName: string; senderName?: string; address?: string }): string;
export function leadStats(leads: { status: string; touches_sent: number; lost_reason?: string; introduced_on?: string | null }[]): {
  total: number; reached: number; replied: number; introduced: number; customers: number; customerRate: number | null;
};
export function fillEmail(text: string, ctx: { firstName?: string; name?: string; clientName?: string }): string;
