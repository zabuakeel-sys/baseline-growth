// Onboarding: the questions to ask a new business, and how their answers set up everything the
// system needs: the offer line, the sales script, the searches that find prospects, and the
// numbers autopilot works with. Plain JS so tests can load it directly.

/** The questions, in the order to ask them. `ask` is said to the owner; `why` is for us. */
export const QUESTIONS = [
  { section: 'About them', key: 'name', ask: 'What is the business called?', why: 'Used in every message.', required: true },
  { section: 'About them', key: 'website', ask: 'What is your website?', why: 'Reps check it before calls.' },
  { section: 'About them', key: 'contact_name', ask: 'Who should we send interested customers to?', why: 'Introductions go to this person.', required: true },
  { section: 'About them', key: 'contact_email', ask: 'Their email?', why: 'Introductions are emailed here.', required: true },
  { section: 'About them', key: 'contact_phone', ask: 'Their phone?', why: 'For urgent hand-offs.' },
  { section: 'What they sell', key: 'offer', ask: 'In one sentence, what do you do for your customers?', why: 'Opens every email and call. Example: "We clean offices and medical buildings across Metro Detroit."', required: true },
  { section: 'What they sell', key: 'why_us', ask: 'Why do customers pick you over others? Give two or three reasons.', why: 'Goes into the script. One reason per line.', multiline: true, required: true },
  { section: 'What they sell', key: 'first_step', ask: 'How does a new customer usually start: a free quote, a walkthrough, a demo, a sign-up?', why: 'What reps ask for. Example: "free walkthrough".', required: true },
  { section: 'What they sell', key: 'logo_url', ask: 'Link to your logo image (optional)', why: 'Shown small under the signature of outreach emails. Must start with https://. Right-click the logo on their website, "Copy image address".' },
  { section: 'What they sell', key: 'claim_url', ask: 'Is there a link where customers book or sign up?', why: 'Goes on the QR code reps show. Leave empty if none.' },
  { section: 'Who to find', key: 'who', ask: 'Who are your best customers? List the types of businesses.', why: 'Each line becomes a search. Example: "dental office", "medical clinic". Be specific.', multiline: true, required: true },
  { section: 'Who to find', key: 'where', ask: 'Where do you serve? List cities, towns or ZIP codes.', why: 'Each place is searched separately and gives up to about 60 businesses, so more places means more prospects.', multiline: true, required: true },
  { section: 'Who to find', key: 'visits', ask: 'Are your customers close enough that a rep could stop by in person?', why: 'Yes adds in-person visits to the schedule for prospects with an address; no keeps it to calls and emails.', choices: [['no', 'No: calls and emails only'], ['yes', 'Yes: add visits']] },
  { section: 'Who to find', key: 'skip', ask: 'Anyone we should not contact? Chains, current customers, competitors.', why: 'Names to skip, separated by commas.' },
  { section: 'Who to find', key: 'customer_value', ask: 'What is a typical new customer worth to you per month (or per job)?', why: 'Tells us which prospects are worth the most effort and what our share is worth.', money: true, required: true },
  { section: 'What people say', key: 'objections', ask: 'What do people usually say when they turn you down, and what do you answer?', why: 'Each pair becomes an answer in the script and in the call coach.', pairs: true },
  { section: 'Pricing (optional)', key: 'pricing', ask: 'If you price by size: what do you charge per 1,000 sq ft per visit, by building type?', why: 'Lets reps quote on the spot. One type per line, like "Office: 45".', multiline: true },
  { section: 'Our deal', key: 'share_percent', ask: 'Revenue share we agreed (% of what each customer we bring pays you)', why: 'From your signed agreement.', percent: true },
  { section: 'Our deal', key: 'share_months', ask: 'For how many months? (empty = as long as they stay)', why: 'From your signed agreement.', whole: true },
  { section: 'Our deal', key: 'signup_fee', ask: 'Fee per new customer, if any', why: 'From your signed agreement.', money: true },
  { section: 'Our deal', key: 'monthly_fee', ask: 'Monthly retainer, if any', why: 'From your signed agreement.', money: true },
  { section: 'Our deal', key: 'contract_start', ask: 'Agreement start date', why: 'Billing starts this month.', date: true },
  { section: 'Our deal', key: 'mailing_address', ask: 'Mailing address for outreach emails (yours or theirs; ask the lawyer)', why: 'US law requires a postal address in commercial email.', required: true },
];

const lines = (text) => String(text || '').split('\n').map((s) => s.trim().replace(/^[-*•]\s*/, '')).filter(Boolean);

/** Search queries: every customer type in every place, at most `max` of them. */
export function buildTargets(who, where, max = 40) {
  const types = lines(who);
  const places = lines(where);
  const out = [];
  for (const place of places) for (const what of types) out.push({ what, location: place });
  return out.slice(0, max);
}

/** Lower-cases a leading word so it reads mid-sentence; keeps acronyms. */
const mid = (t) => (/^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
const sentence = (t) => { const s = String(t || '').trim(); return s ? (/[.!?]$/.test(s) ? s : `${s}.`) : ''; };

/** Objection pairs from the form: [{ said, answer }], blanks dropped. */
export function objectionPairs(get) {
  const out = [];
  for (let i = 1; i <= 5; i++) {
    const said = String(get(`objection${i}`) || '').trim();
    const answer = String(get(`answer${i}`) || '').trim();
    if (said && answer) out.push({ said, answer });
  }
  return out;
}

/**
 * The sales script, written from their answers in the format the call coach reads:
 * objection lines start with 'If they say "...":'.
 */
export function buildScript({ name, offer, why_us, first_step, who, objections }) {
  const step = mid(String(first_step || 'a short call').trim().replace(/[.\s]+$/, ''));
  const firstType = lines(who)[0];
  const reasons = lines(why_us);
  const out = [
    `Opening: Hi, this is [your name], calling on behalf of ${name}. ${sentence(offer)} Do you have 30 seconds?`,
    '',
    'Why customers pick them:',
    ...reasons.map((r) => `- ${sentence(r)}`),
    '',
    'Questions to ask:',
    `- Who takes care of this for you today?`,
    '- What would you change about how it is handled?',
    firstType ? `- How does your ${mid(firstType)} decide on this, and who makes the call?` : '- Who makes the decision on this?',
    '',
    'Answers:',
    ...objections.map((o) => `If they say "${o.said.replace(/"/g, "'")}": ${sentence(o.answer)}`),
  ];
  // Sensible defaults for the objections they did not cover.
  const covered = objections.map((o) => o.said.toLowerCase()).join(' ');
  if (!/price|cost|expensive|budget/.test(covered)) out.push(`If price comes up: The ${step} is free, so you can compare real numbers before deciding anything.`);
  if (!/already|have someone|current/.test(covered)) out.push(`If they say "we already have someone": Most of ${name}'s customers did too. What would you change about them?`);
  if (!/send|email|info/.test(covered)) out.push(`If they say "send me some info": Happy to. What should it cover so it is worth your time? And can we pencil in a ${step} in case it fits?`);
  out.push('', `Ask for: a ${step} this week.`);
  return out.join('\n');
}

/** Required answers still missing, as question texts. */
export function missingAnswers(get) {
  return QUESTIONS.filter((q) => q.required && !String(get(q.key) ?? '').trim()).map((q) => q.ask);
}
