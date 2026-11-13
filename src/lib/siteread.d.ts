export type SiteFacts = { title: string; siteName: string; description: string; logo: string; phones: string[]; bookingLink: string; email: string; address: string; areas: string[]; links: string[]; text: string };
export function structuredData(html: string): { name: string; telephone: string; email: string; address: string; areas: string[]; logo: string };
export function findAddress(text: string): string;
export function visibleText(html: string): string;
export function extractSite(html: string, baseUrl: string): SiteFacts;
export function pagesToRead(links: string[], max?: number): string[];
