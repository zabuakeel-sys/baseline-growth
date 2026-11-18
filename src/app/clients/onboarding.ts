'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { requireOwner } from '@/lib/auth';
import { QUESTIONS, TERM_KEYS, buildScript, buildTargets, missingQuestions, objectionPairs } from '@/lib/onboarding';
import { readSite } from '@/lib/research';
import { draftSignup } from '@/lib/coach';
import { parsePricingLines } from '@/lib/playbook';
import { applyPlay } from '@/lib/plays';
import { suggestPlay } from '@/lib/suggestPlay';
import { parseDollarsToCents, parsePercent, parseWholeNumber } from '@/lib/money';

type Result = { error?: string; field?: string };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Creates or updates a business from the owner's answers, and sets up what the system needs:
 * offer, script, searches, deal terms. Autopilot takes it from there.
 */
export async function saveOnboarding(clientId: number | null, formData: FormData): Promise<Result> {
  await requireOwner();
  const get = (k: string) => String(formData.get(k) ?? '').trim();
  const missing = missingQuestions(get);
  if (missing.length) return { error: `Still needed: ${missing[0].ask}${missing.length > 1 ? ` (and ${missing.length - 1} more)` : ''}`, field: missing[0].key };
  if (get('contact_email') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(get('contact_email'))) return { error: 'The contact email does not look right.', field: 'contact_email' };
  if (get('claim_url')) {
    try { const u = new URL(get('claim_url')); if (!/^https?:$/.test(u.protocol)) throw new Error(); } catch { return { error: 'The booking link must be a full web address starting with https://', field: 'claim_url' }; }
  }
  if (get('logo_url')) {
    try { const u = new URL(get('logo_url')); if (u.protocol !== 'https:') throw new Error(); } catch { return { error: 'The logo link must be a full web address starting with https://', field: 'logo_url' }; }
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
  if (errors.length) return { error: errors[0], field: 'pricing' };
  const targets = buildTargets(get('who'), get('where'));
  if (!targets.length) return { error: 'Add at least one type of customer and one place.', field: 'who' };

  const objections = objectionPairs(get);
  const answers: Record<string, unknown> = Object.fromEntries(QUESTIONS.filter((q) => !q.pairs).map((q) => [q.key, get(q.key)]));
  answers.objections = objections;
  // The strategy (play) sets the first email and the claim-button label, and fills them server-side
  // if the form did not carry them (the by-hand path). A chosen play's own email wording wins only
  // when the owner left the email blank.
  const applied = get('play') ? applyPlay(get('play'), { businessName: get('name') }) : null;
  const outreachSubject = get('outreach_subject') || applied?.outreach_subject || '';
  const outreachBody = get('outreach_body') || applied?.outreach_body || '';
  const claimLabel = get('claim_label') || applied?.claim_label || (get('first_step') ? `Book your ${get('first_step').toLowerCase().replace(/^(a|an|the)\s+/, '')}` : '');
  const fields = {
    name: get('name'), website: get('website'), contact_name: get('contact_name'), contact_email: get('contact_email'),
    contact_phone: get('contact_phone'), offer: (get('offer') || applied?.offer || '').replace(/\s+/g, ' '), goal: get('goal') || applied?.goal || '', why_us: get('why_us'), first_step: get('first_step') || applied?.first_step || '',
    claim_url: get('claim_url'), claim_label: claimLabel,
    visits: get('visits') === 'yes', logo_url: get('logo_url'),
    customer_value_cents: value, mailing_address: get('mailing_address'),
    play: applied ? applied.play : '', outreach_subject: outreachSubject, outreach_body: outreachBody,
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
  redirect(clientId === null
    ? `/clients/${id}?saved=${encodeURIComponent(`${fields.name} is added. Follow the steps below to start selling`)}`
    : `/clients/${id}?saved=Answers+saved`);
}

/**
 * Picking a strategy (play) while adding a business: fills the goal, offer, first step, rhythm and
 * the first email into the draft from the play, then returns to the form where the owner tweaks and
 * approves the email. Only fills fields the website draft left blank, except the email, which the
 * play always provides (and the owner then edits).
 */
export async function applyPlayToDraft(draftId: number, playKey: string): Promise<Result> {
  await requireOwner();
  const draft = (await query<{ answers: Record<string, unknown>; filled: string[] }>(
    'SELECT answers, filled FROM onboarding_drafts WHERE id = $1', [draftId])).rows[0];
  if (!draft) return { error: 'That draft expired. Start again from the website.' };
  const a = draft.answers ?? {};
  const applied = applyPlay(playKey, { businessName: String(a.name ?? '') });
  if (!applied) return { error: 'Pick one of the strategies.' };
  const keep = (k: string, fallback: string) => (String(a[k] ?? '').trim() ? a[k] : fallback);
  const answers = {
    ...a,
    play: applied.play,
    goal: keep('goal', applied.goal),
    offer: keep('offer', applied.offer),
    first_step: keep('first_step', applied.first_step),
    claim_label: applied.claim_label,
    visits: applied.visits ? 'yes' : (a.visits || 'no'),
    outreach_subject: applied.outreach_subject,
    outreach_body: applied.outreach_body,
  };
  await query('UPDATE onboarding_drafts SET answers = $2 WHERE id = $1', [draftId, JSON.stringify(answers)]);
  redirect(`/clients/new?draft=${draftId}`);
}

/** Autopilot on or off for a business, and how many new prospects a day. */
export async function saveAutopilot(clientId: number, formData: FormData): Promise<Result> {
  await requireOwner();
  const daily = parseWholeNumber(formData.get('daily_prospects'));
  if (daily === null || Number.isNaN(daily) || daily > 500) return { error: 'New prospects per day must be 0 to 500.' };
  await query('UPDATE clients SET autopilot = $2, daily_prospects = $3 WHERE id = $1', [clientId, formData.get('autopilot') === 'on', daily]);
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?saved=Autopilot+saved`);
}

/** One tap from the business page: turn on prospect finding. The background run (every 5 minutes) does the rest. */
export async function startFinding(clientId: number): Promise<Result> {
  await requireOwner();
  const c = (await query<{ n: number }>('SELECT count(*)::int AS n FROM targets WHERE client_id = $1', [clientId])).rows[0];
  if (!c.n) return { error: 'Say who to find and where first: open Edit answers and fill in customer types and places.' };
  await query('UPDATE clients SET autopilot = true, daily_prospects = CASE WHEN daily_prospects > 0 THEN daily_prospects ELSE 10 END WHERE id = $1', [clientId]);
  revalidatePath('/');
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?saved=${encodeURIComponent('Prospect finding is on. The first prospects show up here within a few minutes')}`);
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
  // Auto-pick a strategy from what we learned, so the owner goes straight to approving the email.
  // The site's own offer and goal are kept over the play's generic ones; only the email, rhythm and
  // visit flag come from the play. It can be changed on the next step.
  const suggestion = suggestPlay({
    name: String(answers.name ?? ''), offer: String(answers.offer ?? ''), why_us: String(answers.why_us ?? ''),
    who: String(answers.who ?? ''), first_step: String(answers.first_step ?? ''), text: site.text,
  });
  answers.suggested_play = suggestion?.key ?? '';
  if (suggestion) {
    const applied = applyPlay(suggestion.key, { businessName: String(answers.name ?? '') });
    if (applied) {
      const keep = (k: string, fb: string) => (String(answers[k] ?? '').trim() ? answers[k] : fb);
      Object.assign(answers, {
        play: applied.play,
        goal: keep('goal', applied.goal),
        offer: keep('offer', applied.offer),
        first_step: keep('first_step', applied.first_step),
        claim_label: applied.claim_label,
        visits: applied.visits ? 'yes' : (answers.visits || 'no'),
        outreach_subject: applied.outreach_subject,
        outreach_body: applied.outreach_body,
        play_auto: '1',
        play_reason: suggestion.reason,
      });
    }
  }
  const id = (await query<{ id: number }>('INSERT INTO onboarding_drafts (website, answers, filled, used_ai) VALUES ($1, $2, $3, $4) RETURNING id',
    [site.url, JSON.stringify(answers), filled, Boolean(ai)])).rows[0].id;
  redirect(`/clients/new?draft=${id}`);
}
