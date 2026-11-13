export type SiteFacts = { title: string; siteName: string; description: string; logo: string; phones: string[]; bookingLink: string; links: string[]; text: string };
export function visibleText(html: string): string;
export function extractSite(html: string, baseUrl: string): SiteFacts;
export function pagesToRead(links: string[], max?: number): string[];
