export function suggestPlay(info?: {
  name?: string; offer?: string; why_us?: string; who?: string; first_step?: string; text?: string;
}): { key: string; reason: string } | null;
