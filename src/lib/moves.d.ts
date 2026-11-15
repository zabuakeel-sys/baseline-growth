export type Move = {
  channel: 'linkedin' | 'mail' | 'sms' | 'gift';
  when: string;
  title: string;
  message: string;
  link?: string;
  linkLabel?: string;
  sms?: string;
  copy?: string;
  caution?: string;
};
export function channelMoves(ctx?: {
  play?: string; business?: string; name?: string; contactName?: string; offer?: string;
  phone?: string; address?: string; claimLabel?: string;
}): Move[];
