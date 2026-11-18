// Ways to reach a prospect beyond the email/call/visit cadence: LinkedIn, direct mail, SMS and a
// small gift, in the order to try them, each with ready-to-send content. Pure (no network or DOM),
// so it is unit-tested. The rep runs these by hand; LinkedIn is also a channel they can log.

const firstNameOf = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/**
 * The multichannel moves for one prospect. Each is
 * { channel, when, title, message, link?, linkLabel?, sms?, copy?, caution? }.
 * ctx: { play, business, name, contactName, offer, phone, address, claimLabel }
 */
export function channelMoves(ctx = {}) {
  const { business = 'us', name = 'them', contactName = '', offer = '', phone = '', address = '', claimLabel = '' } = ctx;
  const first = firstNameOf(contactName) || 'there';
  const who = contactName || 'the owner or manager';
  const moves = [];

  // 1. LinkedIn: reach the decision-maker where they network. A real, loggable channel.
  moves.push({
    channel: 'linkedin',
    when: 'Day 1, after the first email',
    title: `Connect with ${who} on LinkedIn`,
    message: `Hi ${first}, I work with ${business} and help businesses like ${name}. Worth a quick connect to see if it's a fit?`,
    link: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent([contactName, name].filter(Boolean).join(' '))}`,
    linkLabel: 'Find them on LinkedIn',
  });

  // 2. Direct mail: a physical touch stands out. Only when we have an address.
  if (address) {
    const line = offer ? offer.replace(/[.\s]+$/, '') : `${claimLabel || 'a quick win'} from ${business}`;
    moves.push({
      channel: 'mail',
      when: 'Day 5, if no reply',
      title: 'Mail a postcard or note',
      message: `A short card to ${name}: "${line}. ${claimLabel ? `${claimLabel} — ` : ''}reply or scan to start." Add your booking link or a QR code.`,
      copy: address,
    });
  }

  // 3. SMS: fast, but only where it's expected. Legal caution shown.
  if (phone) {
    moves.push({
      channel: 'sms',
      when: 'Only if they replied or opted in',
      title: 'Send a text',
      message: `Hi ${first}, it's ${business}, following up on my email. Want me to send details or set up a quick time?`,
      sms: String(phone).replace(/[^\d+]/g, ''),
      caution: 'Only text a business that expects it. Cold texting carries legal risk (TCPA).',
    });
  }

  // 4. A small gift warms up a stalled conversation or thanks a meeting.
  moves.push({
    channel: 'gift',
    when: 'Before a key call, or after a meeting',
    title: 'Send a small gift',
    message: `A coffee card or a handwritten note to ${who} warms up the next call. Keep it small and genuine, not a bribe.`,
  });

  return moves;
}

// The timed sequence a rep walks one move at a time, with the days to wait before each becomes due.
// Cold SMS is deliberately left out of the automatic sequence (legal risk); it stays a manual option.
const SEQUENCE_ORDER = ['linkedin', 'mail', 'gift'];
const SEQUENCE_GAP = { linkedin: 1, mail: 4, gift: 7 };

/**
 * The ordered multichannel sequence for one prospect: the moves to do in turn, each with `days` (how
 * long to wait before it is due). Moves that do not apply (e.g. mail with no address) are left out,
 * so the sequence is the real list of steps for this lead.
 */
export function moveSequence(ctx = {}) {
  const all = channelMoves(ctx);
  return SEQUENCE_ORDER
    .map((kind) => all.find((m) => m.channel === kind))
    .filter(Boolean)
    .map((m) => ({ ...m, days: SEQUENCE_GAP[m.channel] ?? 3 }));
}

/**
 * True when the win for this business is the prospect signing up or claiming a listing on its app
 * (like AutoAt), not a meeting. Set by the "Claim a free listing" strategy, or read from the
 * business's own first step and goal when no strategy was picked.
 */
export function isClaimFlow({ play = '', firstStep = '', goal = '' } = {}) {
  if (play === 'claim_listing') return true;
  if (play) return false;
  return /\b(claim|sign[ -]?up|signup|register|list(ing)?|join)\b/i.test(`${firstStep} ${goal}`);
}

/**
 * What a rep says and sends on a claim-your-listing call: the opener, and the text and email that
 * carry the prospect's own sign-up link once they say yes on the phone.
 */
export function claimCall({ business = 'us', name = 'your business', contactName = '', repName = '', link = '' } = {}) {
  const first = firstNameOf(contactName);
  const me = firstNameOf(repName) || 'I';
  const linkPart = link ? `: ${link}` : '. (Add the sign-up link in Settings first.)';
  return {
    opener: `Hi, is this the owner or manager? This is ${me} with ${business}. ${name} already has a page on ${business} where drivers find shops and book them. I'm calling so you can claim it and start getting those bookings. Can I text you the link?`,
    sms: `Hi${first ? ` ${first}` : ''}, it's ${me} with ${business}, thanks for the call. Here's the link to claim ${name} on ${business}${linkPart}`,
    emailSubject: `Your ${business} link for ${name}`,
    emailBody: `Hi${first ? ` ${first}` : ''},\n\nThanks for the call. Here's the link to claim ${name} on ${business}${linkPart}\n\nIt only takes a few minutes. Reply here if anything gets stuck.\n\n${repName || me}\n${business}`,
  };
}
