export type AreaKey = 'found' | 'convert' | 'reach' | 'repeat' | 'price';
export type Area = {
  key: AreaKey; name: string; problem: string; statements: string[];
  plan: { month: 1 | 2 | 3; action: string }[];
};
export type Answers = Record<AreaKey, number[]>;
export const RATING_LABELS: string[];
export const AREAS: Area[];
export function fieldName(areaKey: string, index: number): string;
export function readAnswers(get: (name: string) => unknown): { answers: Answers; missing: string[] };
export function areaScore(ratings: number[]): number;
export function scoreCheckup(answers: Answers): {
  scores: { key: AreaKey; name: string; score: number }[];
  focus: AreaKey[];
  overall: number;
};
export function buildPlan(focus: string[]): { month: number; items: { area: string; action: string }[] }[];
