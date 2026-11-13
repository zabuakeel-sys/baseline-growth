export function parseExclude(text: string): string[];
export function isExcluded(name: string, exclude: string[]): boolean;
export function scoreCandidate(c: {
  website?: string; email?: string; phone?: string; rating?: number | null; reviews?: number | null; operational?: boolean;
}): { score: number; reasons: string[] };
export function hostOf(url: string): string;
export function pickEmail(html: string, siteUrl: string): string;
export function pickAbout(html: string): string;
export function contactPages(siteUrl: string): string[];
export function isPrivateAddress(ip: string): boolean;
