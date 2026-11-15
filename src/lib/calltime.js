// The best time of day to call a business so you do not catch them slammed. A plain heuristic by
// trade (no data source): when are they open but not in their rush? Pure, so it is unit-tested.

const RULES = [
  {
    keys: /restaurant|cafe|coffee|diner|pizza|grill|bakery|\bbar\b|bistro|eatery|taco|burger|deli|catering|food/i,
    when: 'Weekday afternoons, 2 to 4pm',
    avoid: 'the lunch and dinner rushes (11:30 to 1:30, after 5)',
  },
  {
    keys: /dental|dentist|orthodont|endodont|medical|clinic|doctor|physician|pediatric|derma|optometr|\beye\b|chiro|health|\bvet\b|veterinar|urgent care|family practice/i,
    when: 'Weekdays mid to late morning, 10 to 11:30am',
    avoid: 'Monday mornings and the 12 to 1 lunch hour (many close for it)',
  },
  {
    keys: /auto|mechanic|repair|\btire\b|collision|body shop|garage|oil change|muffler|transmission|brake|car wash|detailing/i,
    when: 'Weekdays 10 to 11:30am or 1:30 to 3pm',
    avoid: 'the 8 to 9am drop-off rush and the end of the day',
  },
  {
    keys: /salon|\bspa\b|barber|\bnail|\bhair|beauty|lash|brow|massage|tattoo/i,
    when: 'Tuesday to Thursday, 10am to noon',
    avoid: 'weekends and evenings (their busiest)',
  },
  {
    keys: /gym|fitness|yoga|pilates|crossfit|martial|dance studio|\bstudio\b/i,
    when: 'Weekdays early afternoon, 1 to 4pm',
    avoid: 'the early-morning and 5 to 7pm workout rushes',
  },
  {
    keys: /cleaning|janitor|landscap|lawn|plumb|\bhvac\b|heating|electric|contractor|roofing|construction|pest|handyman|pressure wash|moving/i,
    when: 'Weekdays 8 to 9am or 4 to 5pm, around job sites',
    avoid: 'the middle of the day, when crews are out on jobs',
  },
  {
    keys: /retail|store|\bshop\b|boutique|grocery|market|florist|jewel|furniture|hardware|pharmacy/i,
    when: 'Weekday mornings, 10 to 11:30am',
    avoid: 'weekends and the midday shopping rush',
  },
  {
    keys: /law|attorney|legal|accountant|\bcpa\b|bookkeep|consult|agency|real estate|realtor|insurance|financ|mortgage|title|notary|architect|engineer/i,
    when: 'Tuesday to Thursday, 10 to 11am or 2 to 4pm',
    avoid: 'Monday mornings and Friday afternoons',
  },
];

const DEFAULT = {
  when: 'Tuesday to Thursday, 10 to 11am or 2 to 4pm',
  avoid: 'Monday mornings and the 12 to 1 lunch hour',
};

/**
 * Best time to call a business, guessed from its name, what it needs and the client's industry.
 * Returns { when, avoid } — both short phrases meant to read after "Best time to call:".
 */
export function bestCallTime({ name = '', need = '', notes = '', industry = '' } = {}) {
  const hay = `${name} ${need} ${notes} ${industry}`;
  for (const rule of RULES) if (rule.keys.test(hay)) return { when: rule.when, avoid: rule.avoid };
  return { ...DEFAULT };
}
