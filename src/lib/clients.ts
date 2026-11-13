import { query } from './db';
import { parseDollarsToCents, parsePercent, parseWholeNumber } from './money';

export const STATUSES = ['prospect', 'active', 'paused', 'ended'] as const;
export type Status = (typeof STATUSES)[number];

export type Client = {
  id: number; name: string; industry: string; website: string;
  contact_name: string; contact_email: string; contact_phone: string;
  status: Status; monthly_fee_cents: number; bonus_percent: number;
  share_percent: number; share_months: number | null; signup_fee_cents: number; offer: string; mailing_address: string; call_script: string;
  claim_url: string; claim_label: string; pricing: import('./playbook').Pricing | null;
  contract_start: string | null; contract_end: string | null; minimum_months: number; notes: string;
};

export type Baseline = {
  client_id: number; monthly_revenue_cents: number | null; monthly_inquiries: number | null;
  close_rate_percent: number | null; avg_sale_cents: number | null; repeat_rate_percent: number | null;
  measured_on: string | null; signed_off: boolean; signed_off_by: string;
};

export type ClientRow = Client & { prospects: number; introduced: number; customers: number };

export async function listClients(): Promise<ClientRow[]> {
  const { rows } = await query<ClientRow>(
    `SELECT c.*,
       (SELECT count(*)::int FROM leads l WHERE l.client_id = c.id AND l.status IN ('new', 'following_up', 'talking')) AS prospects,
       (SELECT count(*)::int FROM leads l WHERE l.client_id = c.id AND l.status = 'introduced') AS introduced,
       (SELECT count(*)::int FROM leads l WHERE l.client_id = c.id AND l.status = 'won') AS customers
     FROM clients c
     ORDER BY CASE c.status WHEN 'active' THEN 0 WHEN 'prospect' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, c.name`,
  );
  return rows;
}

export async function getClient(id: number) {
  const c = await query<Client>('SELECT * FROM clients WHERE id = $1', [id]);
  if (!c.rows[0]) return null;
  const b = await query<Baseline>('SELECT * FROM baselines WHERE client_id = $1', [id]);
  return { client: c.rows[0], baseline: b.rows[0] ?? null };
}

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates the client form. Returns clean values plus a list of plain-language errors. */
export function parseClientForm(f: FormData, { includeTerms }: { includeTerms: boolean }) {
  const errors: string[] = [];
  const name = str(f, 'name');
  if (!name) errors.push('Name is required.');
  const status = str(f, 'status') || 'prospect';
  if (!STATUSES.includes(status as Status)) errors.push('Pick a valid status.');
  const values: Record<string, unknown> = {
    name, status,
    industry: str(f, 'industry'), website: str(f, 'website'),
    contact_name: str(f, 'contact_name'), contact_email: str(f, 'contact_email'), contact_phone: str(f, 'contact_phone'),
    notes: str(f, 'notes'),
    offer: str(f, 'offer'), mailing_address: str(f, 'mailing_address'),
  };
  if (includeTerms) {
    const fee = parseDollarsToCents(f.get('monthly_fee'));
    if (Number.isNaN(fee)) errors.push('Monthly fee must be a dollar amount, like 3500.');
    const share = parsePercent(f.get('share_percent'));
    if (Number.isNaN(share)) errors.push('Revenue share must be a percent from 0 to 100.');
    const shareMonths = parseWholeNumber(f.get('share_months'));
    if (Number.isNaN(shareMonths) || shareMonths === 0) errors.push('Share months must be a whole number above zero, or empty for as long as the customer stays.');
    const signupFee = parseDollarsToCents(f.get('signup_fee'));
    if (Number.isNaN(signupFee)) errors.push('Fee per new customer must be a dollar amount.');
    const minimum = parseWholeNumber(f.get('minimum_months'));
    if (Number.isNaN(minimum)) errors.push('Minimum months must be a whole number.');
    const start = str(f, 'contract_start');
    if (start && !DATE.test(start)) errors.push('Contract start must be a date.');
    const end = str(f, 'contract_end');
    if (end && !DATE.test(end)) errors.push('Contract end must be a date.');
    if (start && end && end < start) errors.push('Contract end cannot be before the start.');
    Object.assign(values, {
      monthly_fee_cents: fee ?? 0, share_percent: share ?? 0, share_months: shareMonths, signup_fee_cents: signupFee ?? 0,
      minimum_months: minimum ?? 6, contract_start: start || null, contract_end: end || null,
    });
  }
  return { errors, values };
}

export function parseBaselineForm(f: FormData) {
  const errors: string[] = [];
  const revenue = parseDollarsToCents(f.get('monthly_revenue'));
  if (Number.isNaN(revenue)) errors.push('Monthly revenue must be a dollar amount.');
  const inquiries = parseWholeNumber(f.get('monthly_inquiries'));
  if (Number.isNaN(inquiries)) errors.push('Inquiries must be a whole number.');
  const closeRate = parsePercent(f.get('close_rate_percent'));
  if (Number.isNaN(closeRate)) errors.push('Close rate must be a percent from 0 to 100.');
  const avgSale = parseDollarsToCents(f.get('avg_sale'));
  if (Number.isNaN(avgSale)) errors.push('Average sale must be a dollar amount.');
  const repeat = parsePercent(f.get('repeat_rate_percent'));
  if (Number.isNaN(repeat)) errors.push('Repeat rate must be a percent from 0 to 100.');
  const measured = str(f, 'measured_on');
  if (measured && !DATE.test(measured)) errors.push('Measured on must be a date.');
  const signedOff = f.get('signed_off') === 'on';
  const signedOffBy = str(f, 'signed_off_by');
  if (signedOff && revenue === null) errors.push('A baseline cannot be signed off without monthly revenue.');
  if (signedOff && !signedOffBy) errors.push('Say who at the client signed off the baseline.');
  return {
    errors,
    values: {
      monthly_revenue_cents: revenue, monthly_inquiries: inquiries, close_rate_percent: closeRate,
      avg_sale_cents: avgSale, repeat_rate_percent: repeat, measured_on: measured || null,
      signed_off: signedOff, signed_off_by: signedOffBy,
    },
  };
}
