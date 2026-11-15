// Warm paths: prospects that came through a referral from a happy customer or an introduction from a
// partner. They convert far better than cold prospects, so they are marked and worked first. Pure.

/** True when a prospect reached us through a referral or a partner, not cold outreach. */
export function isWarm(lead) {
  return lead?.source === 'Referral' || lead?.referred_by != null || lead?.partner_id != null;
}

/** A short label for how a warm prospect reached us, or '' if cold. */
export function warmSource(lead) {
  if (lead?.partner_id != null) return lead.partner_name ? `Partner intro: ${lead.partner_name}` : 'Partner introduction';
  if (lead?.referred_by != null || lead?.source === 'Referral') return 'Referred by a customer';
  return '';
}

/** Stable sort that floats warm prospects to the front, keeping the rest in their order. */
export function warmFirst(leads) {
  return [...leads].sort((a, b) => Number(isWarm(b)) - Number(isWarm(a)));
}
