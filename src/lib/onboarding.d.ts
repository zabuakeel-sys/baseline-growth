export type Question = { section: string; key: string; ask: string; why: string; required?: boolean; multiline?: boolean; money?: boolean; percent?: boolean; whole?: boolean; date?: boolean; pairs?: boolean; choices?: [string, string][]; owner?: boolean };
export const TERM_KEYS: string[];
export const QUESTIONS: Question[];
export function buildTargets(who: string, where: string, max?: number): { what: string; location: string }[];
export function objectionPairs(get: (k: string) => unknown): { said: string; answer: string }[];
export function buildScript(a: { name: string; offer: string; why_us: string; first_step: string; who: string; objections: { said: string; answer: string }[] }): string;
export function missingAnswers(get: (k: string) => unknown): string[];
export const US_METROS: string[];
export function isNationwide(place: string): boolean;
