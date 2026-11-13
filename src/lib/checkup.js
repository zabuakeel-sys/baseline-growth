// The Revenue Checkup: 15 statements across the five revenue bottlenecks.
// Plain JS (no framework imports) so tests can load it directly.
//
// Each statement describes a HEALTHY business. The person running the checkup rates how
// true it is, 1 (not true) to 5 (fully true). An area scores 0-100; the lowest areas are
// where revenue is stuck, and they decide the 90-day plan.

export const RATING_LABELS = ['Not true', 'Rarely', 'Partly', 'Mostly', 'Fully true'];

export const AREAS = [
  {
    key: 'found',
    name: 'Getting found',
    problem: 'Not enough of the right people know about them.',
    statements: [
      'When people search for what they sell nearby, they show up on Google and Maps.',
      'They have more and better recent reviews than their main competitors.',
      'New inquiries arrive every week without them having to chase anyone.',
    ],
    plan: [
      { month: 1, action: 'Fix the Google Business Profile: categories, service area, hours, 10+ real photos.' },
      { month: 1, action: 'Ask every customer from the last 90 days for a review; make the ask part of every finished job.' },
      { month: 2, action: 'Publish one page or post per main service and city, answering what buyers actually search.' },
      { month: 3, action: 'If reviews and profile are strong, test a small local ads budget and track every inquiry it brings.' },
    ],
  },
  {
    key: 'convert',
    name: 'Turning inquiries into sales',
    problem: 'People reach out, but too few become paying customers.',
    statements: [
      'Every call, form and message gets a reply within one hour during business hours.',
      'Every inquiry is tracked and followed up until it buys or says no.',
      'They know their close rate, and it is where they want it to be.',
    ],
    plan: [
      { month: 1, action: 'Route every call, form and message to one place, with a one-hour reply rule and an owner for each lead.' },
      { month: 1, action: 'Set a follow-up rhythm for every open inquiry: day 1, 3, 7 and 14.' },
      { month: 2, action: 'Write the first-call script and a standard quote that answers the top three objections.' },
      { month: 3, action: 'Review every lost deal each month and fix the most common reason.' },
    ],
  },
  {
    key: 'reach',
    name: 'Reaching the right buyers',
    problem: 'Their best-fit customers exist but never hear from them.',
    statements: [
      'They can name their ideal customer and where to find them.',
      'They have a steady way to reach those buyers directly.',
      'Other businesses regularly send customers their way.',
    ],
    plan: [
      { month: 1, action: 'Write down the ideal customer and build a list of the first 100 to reach.' },
      { month: 2, action: 'Reach 25 of them a week with a useful offer, and track every reply.' },
      { month: 2, action: 'Sign three referral partners who already serve the same customers.' },
      { month: 3, action: 'Keep the channel that produced meetings; drop the one that did not.' },
    ],
  },
  {
    key: 'repeat',
    name: 'Bringing customers back',
    problem: 'Customers buy once and disappear.',
    statements: [
      'Customers buy again, or stay on a recurring plan.',
      'They ask happy customers for referrals as a routine, not by chance.',
      'They contact past customers with an offer at least every quarter.',
    ],
    plan: [
      { month: 1, action: 'Pull the list of every past customer with contact details.' },
      { month: 2, action: 'Send past customers a win-back offer and track who returns.' },
      { month: 2, action: 'Ask for a referral at the end of every job, with a simple thank-you reward.' },
      { month: 3, action: 'Offer a recurring plan or maintenance package to customers who buy repeatedly.' },
    ],
  },
  {
    key: 'price',
    name: 'Pricing',
    problem: 'They are busy, but keep too little of what they earn.',
    statements: [
      'Their prices went up in the last 12 months, or sit clearly above the cheapest competitor.',
      'They offer packages or tiers, not one price for everyone.',
      'Their margins leave room to invest in growth.',
    ],
    plan: [
      { month: 1, action: 'Compare prices and what is included against three competitors.' },
      { month: 2, action: 'Build good, better and best packages around what customers value most.' },
      { month: 3, action: 'Raise prices for new customers and watch the close rate for a month.' },
    ],
  },
];

const AREA_KEYS = AREAS.map((a) => a.key);

/** Field name for one statement's rating in the form: "found_0", "convert_2", ... */
export const fieldName = (areaKey, index) => `${areaKey}_${index}`;

/**
 * Reads ratings out of a form-like getter. Returns { answers, missing } where answers is
 * { found: [r, r, r], ... } with every rating an integer 1-5, and missing lists statements left blank.
 */
export function readAnswers(get) {
  const answers = {};
  const missing = [];
  for (const area of AREAS) {
    answers[area.key] = area.statements.map((statement, i) => {
      const n = Number(get(fieldName(area.key, i)));
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        missing.push(statement);
        return null;
      }
      return n;
    });
  }
  return { answers, missing };
}

/** 0-100 for one area: all 1s = 0, all 5s = 100. */
export function areaScore(ratings) {
  const sum = ratings.reduce((s, r) => s + r, 0);
  const min = ratings.length;
  const max = ratings.length * 5;
  return Math.round(((sum - min) / (max - min)) * 100);
}

/**
 * Scores every area and picks the focus: the lowest-scoring areas, at most two.
 * A second area only joins when it is within 15 points of the lowest, so one clear
 * problem gets the whole plan. If every area scores 75 or more there is no focus.
 */
export function scoreCheckup(answers) {
  const scores = AREAS.map((area) => ({ key: area.key, name: area.name, score: areaScore(answers[area.key]) }));
  // Lowest first; ties keep the order of AREAS, which follows the customer's path.
  const ranked = [...scores].sort((a, b) => a.score - b.score || AREA_KEYS.indexOf(a.key) - AREA_KEYS.indexOf(b.key));
  const focus = [];
  if (ranked[0].score < 75) {
    focus.push(ranked[0].key);
    if (ranked[1].score < 75 && ranked[1].score - ranked[0].score <= 15) focus.push(ranked[1].key);
  }
  const overall = Math.round(scores.reduce((s, a) => s + a.score, 0) / scores.length);
  return { scores, focus, overall };
}

/** The 90-day plan for the focus areas, grouped by month. */
export function buildPlan(focus) {
  const months = [1, 2, 3].map((month) => ({ month, items: [] }));
  for (const key of focus) {
    const area = AREAS.find((a) => a.key === key);
    for (const step of area.plan) months[step.month - 1].items.push({ area: area.name, action: step.action });
  }
  return months;
}
