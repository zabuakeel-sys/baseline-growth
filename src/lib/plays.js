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
  {
    key: 'free_demo',
    name: 'Book a free demo',
    best_for: 'Software and apps sold to businesses: booking, scheduling, POS, CRM and the like.',
    rhythm: 'Email and calls, no in-person visits. A short demo is the goal.',
    visits: false,
    goal: 'Get the decision-maker at each business to book a short, free demo of {business}.',
    offer: 'A short, free demo of {business}, at a time that suits you.',
    first_step: 'free demo',
    claim_label: 'Book a demo',
    subject: 'A quick look at {business} for {name}',
    body: `Hi {first_name},

I'm with {business}, and I think what we do could be a good fit for {name}. The easiest way to tell is a short demo, no slides, just the parts that matter to you.

Grab a time that works: [book a demo]

If someone else would be the right person to show this to, point me their way.`,
  },
  {
    key: 'free_trial',
    name: 'Start a free trial',
    best_for: 'Self-serve software and online tools a business can try on its own.',
    rhythm: 'Email and calls, no in-person visits. The goal is to get them trying it, not a meeting.',
    visits: false,
    goal: 'Get each business to start a free trial of {business}.',
    offer: 'A free trial of {business}, no card required.',
    first_step: 'free trial',
    claim_label: 'Start a free trial',
    subject: 'A free trial of {business} for {name}',
    body: `Hi {first_name},

I'm with {business}. If it's useful, {name} can try it free, no card and no commitment, and see for yourself whether it helps.

Start whenever you like: [start a free trial]

Not the right person? Feel free to forward this along.`,
  },
  {
    key: 'free_consultation',
    name: 'Offer a free consultation',
    best_for: 'Professional services sold to businesses: accounting, legal, marketing, IT, HR, insurance.',
    rhythm: 'Email and calls, no in-person visits. A short call is the goal.',
    visits: false,
    goal: 'Get the decision-maker at each business to book a free, no-obligation consultation with {business}.',
    offer: 'A free, no-obligation consultation with {business}.',
    first_step: 'free consultation',
    claim_label: 'Book a consultation',
    subject: 'A free consult for {name}',
    body: `Hi {first_name},

I'm with {business}. I'd be glad to set up a short, free consultation for {name}, no obligation, to talk through where we might help and whether it's worth going further.

Book a time that suits you: [book a consultation]

If there's a better person for this, point me their way and I'll reach out to them.`,
  },
  {
    key: 'free_sample',
    name: 'Send a free sample',
    best_for: 'Suppliers selling to businesses: food and drink, products, materials a buyer wants to try.',
    rhythm: 'Email, calls, and a visit to drop samples when the prospect is nearby.',
    visits: true,
    goal: 'Get the buyer at each business to accept a free sample from {business}.',
    offer: 'A free sample from {business}, no obligation.',
    first_step: 'free sample',
    claim_label: 'Get a free sample',
    subject: 'A sample for {name}',
    body: `Hi {first_name},

I'm with {business}. If it's useful, I'd be glad to get a free sample to {name} so you can try it before deciding anything, no obligation.

Let me know the best way to get it to you, or grab a time here: [get a free sample]

If someone else handles buying, feel free to pass this along.`,
  },
  {
    key: 'wholesale_account',
    name: 'Open a wholesale account',
    best_for: 'Wholesalers and distributors offering trade pricing to shops, restaurants and resellers.',
    rhythm: 'Email and calls, with a visit when the prospect is nearby.',
    visits: true,
    goal: 'Get the buyer at each business to open a free wholesale account with {business} and see trade pricing.',
    offer: 'A free wholesale account with {business} and access to trade pricing.',
    first_step: 'wholesale account',
    claim_label: 'See wholesale pricing',
    subject: 'Wholesale pricing for {name}',
    body: `Hi {first_name},

I'm with {business}. We supply businesses like {name}, and opening a wholesale account is free and gets you our trade pricing, with no commitment to order.

You can set it up here: [see wholesale pricing]

If there's a better person to talk to about buying, point me their way.`,
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
