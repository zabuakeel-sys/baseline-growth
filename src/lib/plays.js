// Plays: ready-made strategies a business is set up with. Picking one fills the goal, the offer,
// the first step, whether reps visit in person, and the first email, all from the business's name.
// Plain JS so tests can load it directly.
//
// Two kinds of placeholder live in a play's email:
//   {business}  -> the business we represent (AutoAt, LibraPro). Filled now, when the play is applied,
//                  so the owner sees the real name while approving the email.
//   {first_name}, {name}, [claim ...] -> filled per prospect at send time by fillEmail (followup.js).

export const PLAYS = [
  {
    key: 'claim_listing',
    name: 'Claim a free listing',
    best_for: 'Marketplaces and apps where a business claims a free profile (like AutoAt).',
    rhythm: 'Email, then polite calls and more emails, no in-person visits. It is free to them, so it keeps going until they claim or opt out.',
    visits: false,
    goal: 'Get every business to claim their free listing on {business} so local customers can find and book them. It costs them nothing, so keep following up politely until they claim it or ask us to stop.',
    offer: 'A free listing on {business} so local customers can find and book you. No cost to claim.',
    first_step: 'claim your free listing',
    claim_label: 'Claim your free listing',
    subject: 'Claim your free {business} listing',
    body: `Hi {first_name},

{business} is a free way for local customers to find and book {name}. Your listing is ready, it just needs you to claim it, and there is no cost to do so.

Claim yours here: [claim your free listing]

Once it is claimed, anyone using {business} can find {name} and book you directly.

If someone else handles this, feel free to pass it along.`,
  },
  {
    key: 'free_walkthrough',
    name: 'Book a free walkthrough',
    best_for: 'Local services that quote on site: cleaning, maintenance, contractors (like LibraPro).',
    rhythm: 'Email, a call, more email, and an in-person visit when the prospect is nearby.',
    visits: true,
    goal: 'Get the decision-maker to book a free, no-obligation on-site walkthrough and quote from {business}.',
    offer: 'A free, no-obligation walkthrough and quote from {business}.',
    first_step: 'free walkthrough',
    claim_label: 'Book your free walkthrough',
    subject: 'A free walkthrough for {name}',
    body: `Hi {first_name},

I reach out on behalf of {business}. We would like to offer {name} a free walkthrough and quote, with no obligation, so you can see exactly what it would look like and what it would cost.

Book a time that suits you here: [book your free walkthrough]

If there is a better person to talk to about this, please point me their way.`,
  },
  {
    key: 'free_quote',
    name: 'Request a free quote',
    best_for: 'Services and B2B offers that can quote without visiting in person.',
    rhythm: 'Email and calls, no in-person visits.',
    visits: false,
    goal: 'Get the business to request a free, no-pressure quote from {business}.',
    offer: 'A free, fast quote from {business}.',
    first_step: 'free quote',
    claim_label: 'Get your free quote',
    subject: 'A quick quote for {name}',
    body: `Hi {first_name},

I reach out on behalf of {business}. If it is useful, we can put together a free, no-pressure quote for {name}.

Request yours here: [get your free quote]

Not the right person? Feel free to forward this along.`,
  },
];

export const PLAY_KEYS = PLAYS.map((p) => p.key);

/** The play with this key, or null. */
export function getPlay(key) {
  return PLAYS.find((p) => p.key === key) ?? null;
}

/**
 * Fill a play for a specific business. Replaces {business} with the business name everywhere (so the
 * stored email reads with the real name), and leaves the per-prospect placeholders for send time.
 * Returns the fields to set on the client, or null for an unknown play key.
 */
export function applyPlay(key, { businessName = '' } = {}) {
  const play = getPlay(key);
  if (!play) return null;
  const fill = (t) => String(t).split('{business}').join(businessName || 'us');
  return {
    play: play.key,
    goal: fill(play.goal),
    offer: fill(play.offer),
    first_step: play.first_step,
    claim_label: play.claim_label,
    visits: play.visits,
    outreach_subject: fill(play.subject),
    outreach_body: fill(play.body),
  };
}
