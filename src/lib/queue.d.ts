export type QueueReason = 'replied' | 'call' | 'visit' | 'new';
type QLead = { id: number; status: string; next_action_on: string | null; next_action: string; phone: string; received_on: string; activity?: unknown[]; meetings?: { status: string }[] };
export function reasonFor(l: QLead, today: string): QueueReason;
export function nextQueue<T extends QLead>(leads: T[], today: string, skipped?: (number | string)[]): T[];
