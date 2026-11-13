// Rules behind the rep tools: instant quotes, pre-call briefs, visit routes, daily goals,
// loss insights and objection matching. Plain JS so tests can load it directly.

// ---------- Instant quote ----------

/**
 * Pricing rules a client sets once, e.g. LibraPro:
 * { types: [{ name: 'Office', ratePer1000Cents: 4500 }], minimumCents: 40000, rangePercent: 10 }
 * ratePer1000Cents = price for one visit per 1,000 sq ft.
 */
export const WEEKS_PER_MONTH = 52 / 12;

/** Monthly price range for a building, or null when the inputs or rules are missing. */
export function quote(rules, { type, sqft, visitsPerWeek }) {
  const t = rules?.types?.find((x) => x.name === type);
  if (!t || !(sqft > 0) || !(visitsPerWeek > 0)) return null;
  const monthly = Math.max((t.ratePer1000Cents * sqft / 1000) * visitsPerWeek * WEEKS_PER_MONTH, rules.minimumCents || 0);
  const spread = (rules.rangePercent ?? 10) / 100;
  const round = (c) => Math.round(c / 1000) * 1000; // to the nearest $10
  return { lowCents: round(monthly * (1 - spread)), highCents: round(monthly * (1 + spread)), midCents: round(monthly) };
}

/** "Office: 45" lines -> pricing types. Returns { types, errors }. */
export function parsePricingLines(text) {
  const types = [];
  const errors = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.+?)\s*[:=]\s*\$?\s*(\d+(?:\.\d{1,2})?)$/);
    if (!m) { errors.push(`Could not read "${line}". Use "Building type: dollars per 1,000 sq ft per visit".`); continue; }
    types.push({ name: m[1].trim(), ratePer1000Cents: Math.round(Number(m[2]) * 100) });
  }
  return { types, errors };
}

// ---------- Pre-call brief ----------

/**
 * A 30-second brief from what the system knows: who they are, signals, history, and the
 * one question to open with. Every line is built from data; nothing is guessed.
 */
export function brief(lead) {
  const lines = [];
  const about = String(lead.notes || '').split('\n')[0]?.trim();
  if (about && !/^https?:/i.test(about)) lines.push(`Who: ${about}`);
  if (lead.rating != null) {
    const r = Number(lead.rating);
    const n = lead.reviews ?? 0;
    let read = `${r} stars from ${n} reviews`;
    if (r >= 4.3 && n < 50) read += ': well liked but not widely known';
    else if (n >= 300) read += ': already busy and well known';
    else if (r < 3.8) read += ': customers have complaints';
    lines.push(`Signals: ${read}.`);
  }
  const lastTalk = (lead.activity || []).find((a) => a.notes);
  if (lead.last_reply && lead.last_reply_kind === 'reply') {
    lines.push(`They wrote: "${String(lead.last_reply).split(/\n\s*On .+wrote:|\n>/)[0].trim().slice(0, 160)}"`);
  } else if (lastTalk) {
    lines.push(`Last note: ${lastTalk.notes.slice(0, 160)}`);
  } else if ((lead.touches_sent || 0) > 0) {
    lines.push(`History: ${lead.touches_sent} email${lead.touches_sent === 1 ? '' : 's'} sent, no reply yet.`);
  } else {
    lines.push('History: first contact.');
  }
  lines.push(`Ask: ${openingQuestion(lead)}`);
  return lines;
}

/** The one question that fits where this prospect is. */
export function openingQuestion(lead) {
  if (lead.status === 'introduced') return `Did ${lead.client_name} reach you, and how did it go?`;
  if (lead.last_reply_kind === 'reply' || lead.status === 'talking') return 'What would need to be true for this to be worth trying?';
  if (lead.need) return `Is ${String(lead.need).replace(/[.\s]+$/, '').toLowerCase()} something you are dealing with right now?`;
  return `Who handles this for you today, and what would you change about it?`;
}

// ---------- Visit route ----------

/**
 * A Google Maps directions link through the given addresses in order (driving).
 * Google's URL format takes an origin, a destination and the stops between; it is kept to
 * 10 stops, a limit on the safe side of what Maps accepts in a link.
 */
export function routeLink(addresses, origin = '') {
  const stops = addresses.map((a) => String(a || '').trim()).filter(Boolean).slice(0, 10);
  if (!stops.length) return null;
  const params = new URLSearchParams({ api: '1', travelmode: 'driving', destination: stops[stops.length - 1] });
  if (origin) params.set('origin', origin);
  if (stops.length > 1) params.set('waypoints', stops.slice(0, -1).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

// ---------- Daily goals ----------

/** Today's counts against goals, as 0-100 percents (capped). */
export function goalProgress(counts, goals) {
  const pct = (n, g) => (g > 0 ? Math.min(100, Math.round((n / g) * 100)) : null);
  return {
    calls: pct(counts.calls, goals.calls),
    visits: pct(counts.visits, goals.visits),
    meetings: pct(counts.meetings, goals.meetings),
  };
}

/**
 * Streak: weekdays in a row, ending today or the last weekday, on which the rep hit every goal
 * they have. days = { 'YYYY-MM-DD': { calls, visits, meetings } }.
 */
export function streak(days, goals, today) {
  const met = (c) => (!goals.calls || c.calls >= goals.calls) && (!goals.visits || c.visits >= goals.visits)
    && (!goals.meetings || c.meetings >= goals.meetings);
  if (!goals.calls && !goals.visits && !goals.meetings) return 0;
  let count = 0;
  const d = new Date(`${today}T12:00:00Z`);
  // A day still in progress does not break the streak.
  let first = true;
  for (let i = 0; i < 400; i++) {
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const c = days[iso] ?? { calls: 0, visits: 0, meetings: 0 };
      if (met(c)) count++;
      else if (!first) break;
      first = false;
    }
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return count;
}

// ---------- Loss insights ----------

/** Lost prospects grouped by reason, biggest first, with a share of all losses. */
export function lossReasons(lost) {
  const counts = new Map();
  for (const l of lost) {
    const reason = l.lost_reason || 'No reason given';
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const total = lost.length;
  return [...counts].map(([reason, n]) => ({ reason, count: n, percent: total ? Math.round((n / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

/** Funnel counts for a client: prospects, reached, conversations, meetings held, customers. */
export function funnel({ leads, activities, meetings }) {
  const conv = new Set(activities.filter((a) => ['talked', 'meeting_booked', 'signed', 'not_interested'].includes(a.outcome)).map((a) => a.lead_id));
  for (const l of leads) if (['talking', 'introduced', 'won'].includes(l.status)) conv.add(l.id);
  return {
    prospects: leads.length,
    reached: leads.filter((l) => l.touches_sent > 0 || conv.has(l.id) || activities.some((a) => a.lead_id === l.id)).length,
    conversations: leads.filter((l) => conv.has(l.id)).length,
    meetingsHeld: new Set(meetings.filter((m) => m.status === 'held').map((m) => m.lead_id)).size,
    customers: leads.filter((l) => l.status === 'won').length,
  };
}

// ---------- Objections (call assistant fallback) ----------

/** Common objections and the words that signal them. */
export const OBJECTIONS = [
  { key: 'price', label: 'Price', words: /\b(expensive|too much|cost|price|pricing|budget|afford|cheaper)\b/i },
  { key: 'incumbent', label: 'Already have someone', words: /\b(already (have|use|got)|current (company|vendor|guy|cleaner|provider)|happy with (our|who))\b/i },
  { key: 'not_interested', label: 'Not interested', words: /\b(not interested|no thanks|no thank you|we're good|we are good)\b/i },
  { key: 'send_info', label: 'Send me information', words: /\b(send (me )?(some )?(info|information|something|an email)|email me)\b/i },
  { key: 'timing', label: 'Bad timing', words: /\b(not (right )?now|bad time|busy right now|call (me )?back|next (month|quarter|year)|in a few months)\b/i },
  { key: 'authority', label: 'Not the decision maker', words: /\b(not my (call|decision)|talk to (my|the) (boss|owner|manager)|the owner decides|corporate handles)\b/i },
  { key: 'contract', label: 'Locked in a contract', words: /\b(under contract|in a contract|contract (ends|runs)|locked in)\b/i },
];

/** Objections heard in a stretch of conversation, in order of first mention. */
export function detectObjections(text) {
  return OBJECTIONS.filter((o) => o.words.test(String(text || ''))).map((o) => o.key);
}

/**
 * The part of a client's script that answers an objection: a line starting with the objection's
 * label or a quoted phrase, e.g. 'If they say "we're all set": ...'. Empty when the script has none.
 */
export function scriptAnswer(script, key) {
  const o = OBJECTIONS.find((x) => x.key === key);
  if (!o) return '';
  const lines = String(script || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(if|when)\b/i.test(line) && (o.words.test(line) || line.toLowerCase().includes(o.label.toLowerCase()))) {
      const rest = line.replace(/^[^:]*:\s*/, '').trim();
      return rest || (lines[i + 1] || '').trim();
    }
  }
  return '';
}
