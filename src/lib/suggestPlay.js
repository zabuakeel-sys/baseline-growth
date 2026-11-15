// Picking the right play for a business automatically from what we learned about it (its name, its
// offer, and the text of its website). Conservative on purpose: when nothing matches with confidence
// it returns null, and the owner picks by hand. Pure, so it is unit-tested.
//
// Order matters: the most specific signal wins, so "cleaning scheduling software" reads as software
// (a demo), not a cleaning service (a walkthrough).

const RULES = [
  { key: 'claim_listing', re: /\b(marketplace|directory|listing|list your business|claim your|find and book|book (you|them) directly|aggregator|platform where (local )?customers)\b/i,
    reason: 'they run a marketplace or directory where businesses claim a listing' },
  { key: 'free_trial', re: /\b(free trial|try (it )?free|no credit card|start free|freemium|self-?serve)\b/i,
    reason: 'they are software a business can try on its own, so a free trial fits' },
  { key: 'free_demo', re: /\b(software|saas|\bapp\b|platform|dashboard|\bcrm\b|\bpos\b|booking system|scheduling (software|platform)|online tool|automation|integrat\w+)\b/i,
    reason: 'they sell software to businesses, so a demo fits' },
  { key: 'wholesale_account', re: /\b(wholesale|distributor|distribution|trade pricing|trade account|bulk order|reseller|supply to (shops|restaurants|retailers))\b/i,
    reason: 'they are a wholesaler or distributor offering trade pricing' },
  { key: 'free_sample', re: /\b(supplier|we supply|sample|coffee roaster|roastery|ingredient|produce supplier|beverage|food service|caterer|manufacturer of|private label)\b/i,
    reason: 'they supply a product a buyer would want to sample' },
  { key: 'free_consultation', re: /\b(accounting|bookkeep\w*|\bcpa\b|law firm|attorney|legal services|marketing agency|advertising agency|consult\w*|advisory|insurance|financial (planning|advisor|services)|wealth management|\bhr\b|recruit\w*|\bit (services|support)\b|managed (it|services)|cyber ?security)\b/i,
    reason: 'they are a professional service, so a free consultation fits' },
  { key: 'free_walkthrough', re: /\b(clean\w*|janitor\w*|landscap\w*|lawn care|pest control|security (guard|systems?)|maintenance|\bhvac\b|plumb\w*|electrician|roofing|general contractor|painting|waste (removal|management)|facilit\w+ (services|management)|flooring|restoration|snow removal|handyman|pressure wash\w*)\b/i,
    reason: 'they are an on-site service that quotes after a walkthrough' },
];

/**
 * Suggest a play for a business from what we know about it. Returns { key, reason } or null when no
 * signal is strong enough (then the owner picks). `info` is { name, offer, why_us, who, first_step, text }.
 */
export function suggestPlay(info = {}) {
  const hay = ['name', 'offer', 'why_us', 'who', 'first_step', 'text']
    .map((k) => String(info[k] ?? '')).filter(Boolean).join(' ').slice(0, 6000);
  if (!hay.trim()) return null;
  for (const rule of RULES) if (rule.re.test(hay)) return { key: rule.key, reason: rule.reason };
  return null;
}
