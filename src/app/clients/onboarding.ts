'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { QUESTIONS, TERM_KEYS, buildScript, buildTargets, missingAnswers, objectionPairs } from '@/lib/onboarding';
import { readSite } from '@/lib/research';
import { draftSignup } from '@/lib/coach';
import { parsePricingLines } from '@/lib/playbook';
import { parseDollarsToCents, parsePercent, parseWholeNumber } from '@/lib/money';

type Result = { error?: string };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Creates or updates a business from the owner's answers, and sets up what the system needs:
 * offer, script, searches, deal terms. Autopilot takes it from there.
 */
export async function saveOnboarding(clientId: number | null, formData: FormData): Promise<Result> {
  await requireOwner();
  const get = (k: string) => String(formData.get(k) ?? '').trim();
  const missing = missingAnswers(get);
  if (missing.length) return { error: `Still needed: ${missing[0]}${missing.length > 1 ? ` (and ${missing.length - 1} more)` : ''}` };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(get('contact_email'))) return { error: 'The contact email does not look right.' };
  if (get('claim_url')) {
    try { const u = new URL(get('claim_url')); if (!/^https?:$/.test(u.protocol)) throw new Error(); } catch { return { error: 'The booking link must be a full web address starting with https://' }; }
  }
  if (get('logo_url')) {
    try { const u = new URL(get('logo_url')); if (u.protocol !== 'https:') throw new Error(); } catch { return { error: 'The logo link must be a full web address starting with https://' }; }
  }
  const value = parseDollarsToCents(get('customer_value'));
  const share = parsePercent(get('share_percent'));
  const months = parseWholeNumber(get('share_months'));
  const signup = parseDollarsToCents(get('signup_fee'));
  const monthly = parseDollarsToCents(get('monthly_fee'));
  if ([value, signup, monthly].some((n) => Number.isNaN(n))) return { error: 'Dollar amounts must be numbers, like 2500.' };
  if (Number.isNaN(share)) return { error: 'Revenue share must be a percent from 0 to 100.' };
  if (Number.isNaN(months) || months === 0) return { error: 'Months must be a whole number above zero, or empty.' };
  if (get('contract_start') && !DATE.test(get('contract_start'))) return { error: 'Agreement start must be a date.' };
  const { types, errors } = parsePricingLines(get('pricing'));
  if (errors.length) return { error: errors[0] };
  const targets = buildTargets(get('who'), get('where'));
  if (!targets.length) return { error: 'Add at least one type of customer and one place.' };

  const objections = objectionPairs(get);
  const answers: Record<string, unknown> = Object.fromEntries(QUESTIONS.filter((q) => !q.pairs).map((q) => [q.key, get(q.key)]));
  answers.objections = objections;
  const fields = {
    name: get('name'), website: get('website'), contact_name: get('contact_name'), contact_email: get('contact_email'),
    contact_phone: get('contact_phone'), offer: get('offer').replace(/\s+/g, ' '), why_us: get('why_us'), first_step: get('first_step'),
    claim_url: get('claim_url'), claim_label: get('first_step') ? `Book your ${get('first_step').toLowerCase().replace(/^(a|an|the)\s+/, '')}` : '',
    visits: get('visits') === 'yes', logo_url: get('logo_url'),
    customer_value_cents: value, mailing_address: get('mailing_address'),
    share_percent: share ?? 0, share_months: months, signup_fee_cents: signup ?? 0, monthly_fee_cents: monthly ?? 0,
    contract_start: get('contract_start') || null,
    pricing: types.length ? JSON.stringify({ types, minimumCents: 0, rangePercent: 10 }) : null,
    onboarding: JSON.stringify(answers),
  };
  const script = buildScript({ name: fields.name, offer: fields.offer, why_us: fields.why_us, first_step: fields.first_step, who: get('who'), objections });
  const rewriteScript = clientId === null || formData.get('rewrite_script') === 'on';
  const cols = Object.keys(fields);
  let id = clientId;
  if (id === null) {
    const r = await query<{ id: number }>(
      `INSERT INTO clients (${cols.join(', ')}, call_script, status, industry) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, $${cols.length + 1}, 'active', $${cols.length + 2}) RETURNING id`,
      [...Object.values(fields), script, buildTargets(get('who'), 'x').map((t) => t.what).slice(0, 3).join(', ')]);
    id = r.rows[0].id;
  } else {
    await query(`UPDATE clients SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}${rewriteScript ? `, call_script = $${cols.length + 2}` : ''} WHERE id = $${cols.length + 1}`,
      rewriteScript ? [...Object.values(fields), id, script] : [...Object.values(fields), id]);
  }
  if (clientId === null && formData.get('save_terms') === 'on') {
    await query('UPDATE outreach_settings SET default_terms = $1 WHERE id = 1', [JSON.stringify(Object.fromEntries(TERM_KEYS.map((k) => [k, get(k)])))]);
  }
  for (const t of targets) {
    await query(
      `INSERT INTO targets (client_id, what, location, exclude) VALUES ($1, $2, $3, $4)
       ON CONFLICT (client_id, lower(what), lower(location)) DO UPDATE SET exclude = EXCLUDED.exclude`,
      [id, t.what, t.location, get('skip')]);
  }
  revalidatePath('/');
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}?saved=${encodeURIComponent(clientId === null
    ? `${fields.name} is set up with ${targets.length} searches. Autopilot will start finding prospects for your reps`
    : 'Answers saved')}`);
}

/** Autopilot on or off for a business, and how many new prospects a day. */
export async function saveAutopilot(clientId: number, formData: FormData): Promise<Result> {
  await requireOwner();
  const daily = parseWholeNumber(formData.get('daily_prospects'));
  if (daily === null || Number.isNaN(daily) || daily > 500) return { error: 'New prospects per day must be 0 to 500.' };
  await query('UPDATE clients SET autopilot = $2, daily_prospects = $3 WHERE id = $1', [clientId, formData.get('autopilot') === 'on', daily]);
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?saved=Autopilot+saved#autopilot-h`);
}

/**
 * Step 1 of adding a business: read its website and draft every answer the site can give.
 * The owner checks them and answers the few only the business owner knows.
 */
export async function readWebsite(formData: FormData): Promise<Result> {
  await requireOwner();
  const raw = String(formData.get('website') ?? '').trim();
  if (!raw) return { error: 'Type their website, like shinecleaning.com.' };
  let url: string;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!u.hostname.includes('.') && process.env.ALLOW_PRIVATE_FETCH !== '1') throw new Error();
    url = u.toString();
  } catch { return { error: 'That does not look like a website address.' }; }
  const site = await readSite(url);
  if (!site) return { error: 'Could not open that website. Check the address, or fill the answers in by hand.' };
  const ai = await draftSignup(site.text, site.url);
  const f = site.facts;
  const answers: Record<string, unknown> = {
    website: site.url,
    name: ai?.name || f.siteName,
    offer: ai?.offer ?? '',
    why_us: ai?.why_us ?? '',
    first_step: ai?.first_step ?? '',
    who: ai?.who ?? '',
    where: ai?.where ?? '',
    contact_phone: f.phones[0] ?? '',
    claim_url: f.bookingLink,
    logo_url: f.logo,
    objections: ai?.objections ?? [],
    contact_name: ai?.contact_name ?? '',
    contact_email: (ai?.contact_email || f.email || '').toLowerCase(),
    mailing_address: ai?.mailing_address || f.address,
    pricing: ai?.pricing ?? '',
    ...(ai ? { visits: ai.local ? 'yes' : 'no' } : {}),
  };
  if (!answers.where && f.areas.length) answers.where = f.areas.join('\n');
  // A pricing draft the form cannot read is dropped rather than shown as an error later.
  if (answers.pricing && parsePricingLines(String(answers.pricing)).errors.length) answers.pricing = '';
  const filled = Object.entries(answers).filter(([k, v]) => k !== 'website' && (Array.isArray(v) ? v.length : String(v ?? '').trim())).map(([k]) => k);
  const id = (await query<{ id: number }>('INSERT INTO onboarding_drafts (website, answers, filled, used_ai) VALUES ($1, $2, $3, $4) RETURNING id',
    [site.url, JSON.stringify(answers), filled, Boolean(ai)])).rows[0].id;
  redirect(`/clients/new?draft=${id}`);
}
