// The mixed outreach schedule: emails sent by the system, calls and visits done by reps.
// Plain JS so tests can load it directly.
//
// Each prospect walks the steps in order from the day they were added. A step that cannot be
// done for this prospect is skipped (no email address: no email steps; no phone: no calls;
// visits only for businesses marked for visits and prospects with an address, otherwise the
// visit becomes a call). A real conversation or reply stops the schedule; a person takes over.

export const CADENCE = [
  { day: 0, channel: 'email' },
  { day: 1, channel: 'call' },
  { day: 3, channel: 'email' },
  { day: 5, channel: 'visit' },
  { day: 7, channel: 'email' },
  { day: 10, channel: 'call' },
  { day: 14, channel: 'email' },
];

/** A call or visit not done this many days after it was due is skipped, so the emails keep going. */
export const MISSED_AFTER_DAYS = 3;

const addDays = (iso, days) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** What a step becomes for this prospect, or null when it cannot be done. */
export function channelFor(step, lead, client) {
  if (step.channel === 'email') return lead.email ? 'email' : null;
  if (step.channel === 'call') return lead.phone ? 'call' : null;
  if (step.channel === 'visit') {
    if (client.visits && lead.address) return 'visit';
    return lead.phone ? 'call' : null;
  }
  return null;
}

/**
 * The prospect's current step, starting at their pointer (lead.cadence_step) and skipping steps
 * that cannot be done. Returns { index, channel, due, overdueDays } or null when the schedule is
 * finished. Only prospects still being reached have a current step.
 */
export function currentStep(lead, client, today, cadence = CADENCE) {
  if (lead.status !== 'new' && lead.status !== 'following_up') return null;
  for (let i = lead.cadence_step ?? 0; i < cadence.length; i++) {
    const channel = channelFor(cadence[i], lead, client);
    if (!channel) continue;
    const due = addDays(lead.received_on, cadence[i].day);
    return { index: i, channel, due, overdueDays: Math.max(0, daysBetween(due, today)) };
  }
  return null;
}

/** True when a rep step was missed long enough that the schedule should move on without it. */
export const isMissed = (step, today) =>
  step !== null && step.channel !== 'email' && step.due <= today && daysBetween(step.due, today) > MISSED_AFTER_DAYS;

/** The words that show on the rep's Today list for a call or visit step. */
export function stepLabel(step, lead, cadence = CADENCE) {
  const emails = lead.touches_sent ?? 0;
  const of = `step ${step.index + 1} of ${cadence.length}`;
  const after = emails > 0 ? ` (they have ${emails} email${emails === 1 ? '' : 's'} from us)` : '';
  return step.channel === 'visit' ? `Visit: drop in and ask for the decision maker${after}, ${of}` : `Call: follow up${after}, ${of}`;
}

/** Steps left for a prospect, for display ("3 calls, 2 emails left"). */
export function stepsLeft(lead, client, cadence = CADENCE) {
  const left = { email: 0, call: 0, visit: 0 };
  for (let i = lead.cadence_step ?? 0; i < cadence.length; i++) {
    const c = channelFor(cadence[i], lead, client);
    if (c) left[c]++;
  }
  return left;
}

/** How many email steps this prospect has before step `index` (= which email number it is). */
export function emailNumber(index, lead, client, cadence = CADENCE) {
  let n = 0;
  for (let i = 0; i < index; i++) if (channelFor(cadence[i], lead, client) === 'email') n++;
  return n;
}

/** Next steps written by the schedule (not by a rep) start like this, so the schedule may replace them. */
export const isScheduleLabel = (text) => /^(Call: follow up|Visit: drop in)/.test(String(text || ''));
