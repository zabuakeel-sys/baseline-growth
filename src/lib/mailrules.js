// Rules for automatic outreach email. Plain JS so tests can load it directly.

/**
 * What an incoming email is. Order matters: a bounce or auto-reply is never treated as a
 * person's answer, and an opt-out wins over everything a person writes.
 *   bounce        the address does not work
 *   auto          out-of-office or other automatic reply: ignore
 *   opt_out       asked not to be contacted: never email again, for any client
 *   not_interested a polite no: mark lost
 *   reply         a person answered: a human takes it from here
 */
export function classifyReply({ from = '', subject = '', text = '', headers = {} }) {
  const f = from.toLowerCase();
  const s = subject.toLowerCase();
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]));
  // Only the new part of the message counts, not the quoted email below it.
  const body = newPart(text).toLowerCase();

  if (/mailer-daemon|postmaster@/.test(f) || /undeliver|delivery status notification|delivery has failed|returned mail|mail delivery failed/.test(s)) {
    return 'bounce';
  }
  if ((h['auto-submitted'] && h['auto-submitted'] !== 'no') || h['x-autoreply'] || h['x-autorespond']
      || /auto(matic)?[- ]?reply|out of (the )?office|away from (the )?office|on vacation|on leave/.test(s)) {
    return 'auto';
  }
  if (/\b(unsubscribe|remove me|take me off|stop (emailing|contacting|sending)|do not (contact|email)|don'?t (contact|email)|no thanks|no thank you)\b/.test(body)
      || /^\s*(stop|remove|unsubscribe)\s*[.!]?\s*$/m.test(body)) {
    return 'opt_out';
  }
  if (/\b(not interested|no interest|we('| a)re all set|already have (a|someone)|we('| a)re good|pass on this|not at this time|not right now)\b/.test(body)) {
    return 'not_interested';
  }
  return 'reply';
}

/** The text a person typed, without the quoted thread underneath. */
export function newPart(text) {
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;
    if (/^On .+wrote:\s*$/.test(line.trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    if (/^From:\s/.test(line.trim()) && out.length) break;
    out.push(line);
  }
  return out.join('\n').trim();
}

/** Bare lower-case address from "Name <a@b.com>". */
export const addressOf = (from) => {
  const m = String(from || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(from || '')).trim().toLowerCase();
};

/**
 * True when it is a good time to send: Monday to Friday, between startHour and endHour
 * in Michigan time. Cold email sent at night or on weekends reads as automated.
 */
export function inSendWindow(date, startHour = 9, endHour = 17, timeZone = 'America/Detroit') {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
      .formatToParts(date).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  return !['Sat', 'Sun'].includes(parts.weekday) && hour >= startHour && hour < endHour;
}

/** How many more can go out today under the daily cap. */
export const remainingToday = (dailyLimit, sentToday) => Math.max(0, dailyLimit - sentToday);
