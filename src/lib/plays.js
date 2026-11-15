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

When someone near {city} looks for a business like {name} on {business}, your listing should be the one they book. It is built and ready, claiming it is free, and once it is live those customers can reach you directly.

Claim {name}'s listing here: [claim your free listing]

Two minutes, no cost. If someone else handles this, feel free to forward it.`,
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

The simplest way to see whether {business} is worth it for {name} is to let us look at your space and put real numbers in front of you, free and with no obligation. No hard sell, just what we would do and what it would cost next to what you pay now.

Grab a time that suits you: [book your free walkthrough]

If there is a better person to talk to about this, point me their way.`,
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

If you are open to it, I will put together a straight, no-pressure quote from {business} for {name}, so you have a real number to weigh against what you pay now. Free, and no obligation to go further.

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

I will keep this short. {business} helps businesses like {name}, and the fastest way to tell if it fits is ten minutes where I show you only the parts that matter to you, no slides.

Pick a time that works: [book a demo]

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

No pitch needed. {name} can try {business} free, with no card and no commitment, and decide for yourself. If it helps you will know quickly, and if not you have lost nothing.

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

Worth a short, free call? I would walk through where {business} could help {name} and give you a straight answer on whether it is worth taking further, with no obligation either way.

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

The easiest way to judge {business} is to try it. I'd be glad to get {name} a free sample, no strings, so you can see the quality for yourself before any talk of ordering.

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

If {name} buys this kind of product, a free wholesale account with {business} gets you our trade pricing with no commitment to order, so you can see the real numbers and decide for yourself.

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
