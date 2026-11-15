export type Contact = { email: string; name: string; title: string; source: string };
export type MergedContact = { email: string; contactName: string; contactTitle: string; source: string };

export function domainOf(input: string): string;
export function isUsableEmail(email: string): boolean;
export function looksGeneric(email: string): boolean;
export function titleRank(title: string): number;
export function fullName(first?: string, last?: string): string;
export function parseHunter(json: unknown): Contact | null;
export function bestApolloPerson(people: unknown[]): Contact | null;
export function mergeContacts(candidates: (Partial<Contact> | null)[], domain?: string): MergedContact | null;
