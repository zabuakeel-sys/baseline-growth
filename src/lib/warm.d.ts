type WarmLead = { source?: string; referred_by?: number | null; partner_id?: number | null; partner_name?: string | null };
export function isWarm(lead: WarmLead | null | undefined): boolean;
export function warmSource(lead: WarmLead | null | undefined): string;
export function warmFirst<T extends WarmLead>(leads: T[]): T[];
