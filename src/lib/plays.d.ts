export type Play = {
  key: string;
  name: string;
  best_for: string;
  rhythm: string;
  visits: boolean;
  goal: string;
  offer: string;
  first_step: string;
  claim_label: string;
  subject: string;
  body: string;
};
export const PLAYS: Play[];
export const PLAY_KEYS: string[];
export function getPlay(key: string): Play | null;
export function applyPlay(key: string, opts?: { businessName?: string }): {
  play: string;
  goal: string;
  offer: string;
  first_step: string;
  claim_label: string;
  visits: boolean;
  outreach_subject: string;
  outreach_body: string;
} | null;
