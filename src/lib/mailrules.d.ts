export type ReplyKind = 'reply' | 'not_interested' | 'opt_out' | 'auto' | 'bounce';
export function classifyReply(m: { from?: string; subject?: string; text?: string; headers?: Record<string, string> }): ReplyKind;
export function newPart(text: string): string;
export function addressOf(from: string): string;
export function inSendWindow(date: Date, startHour?: number, endHour?: number, timeZone?: string): boolean;
export function remainingToday(dailyLimit: number, sentToday: number): number;
