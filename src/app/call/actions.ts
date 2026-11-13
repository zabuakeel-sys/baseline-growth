'use server';
import { requireUser } from '@/lib/auth';
import { getLead } from '@/lib/leads';
import { brief } from '@/lib/playbook';
import { suggestNext, type Suggestion } from '@/lib/coach';

/** Next best line for the rep, from the transcript so far. Nothing is stored. */
export async function coachCall(leadId: number, transcript: string): Promise<Suggestion | { error: string }> {
  await requireUser();
  const lead = await getLead(leadId);
  if (!lead) return { error: 'That prospect no longer exists.' };
  if (lead.status === 'opted_out') return { error: 'This prospect asked not to be contacted.' };
  return suggestNext({
    transcript: String(transcript ?? '').slice(-6000),
    clientName: lead.client_name,
    offer: lead.client_offer,
    script: lead.client_script,
    brief: brief(lead as unknown as Record<string, unknown>),
  });
}
