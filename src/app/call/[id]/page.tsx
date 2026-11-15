import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getLead } from '@/lib/leads';
import { brief } from '@/lib/playbook';
import { bestCallTime } from '@/lib/calltime';
import { coachConfigured } from '@/lib/coach';
import { logActivity } from '../../sales/actions';
import CallAssistant from '../CallAssistant';

export const dynamic = 'force-dynamic';

export default async function CallPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; from?: string }> }) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const lead = await getLead(id);
  if (!lead) notFound();
  const { saved, from } = await searchParams;
  const fromNext = from === 'next';
  if (lead.status === 'opted_out') {
    return <p>{lead.name} asked not to be contacted. <Link href="/next">Back to Next up</Link></p>;
  }
  return (
    <>
      <p>{fromNext ? <Link href="/next">Back to Next up</Link> : <Link href={`/clients/${lead.client_id}#leads-h`}>Back to {lead.client_name}</Link>}</p>
      <h1>Call: {lead.name}</h1>
      <p className="sub">
        {lead.client_name}
        {lead.phone && <> · <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}>{lead.phone}</a></>}
        {' · '}put the call on speaker near this device.
      </p>
      {(() => { const ct = bestCallTime({ name: lead.name, need: lead.need, notes: lead.notes }); return (
        <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>Best time to call: {ct.when}. Avoid {ct.avoid}.</p>
      ); })()}
      {saved && <p className="notice" role="status">{saved}. <Link href="/next">Back to Next up</Link></p>}
      <ul className="brief" aria-label="Brief" style={{ marginBottom: 16 }}>
        {brief(lead as unknown as Record<string, unknown>).map((l, i) => <li key={i}>{l}</li>)}
      </ul>
      {!coachConfigured() && (
        <p className="muted" style={{ fontSize: 13 }}>
          The AI coach is not connected (no ANTHROPIC_API_KEY on the server), so suggestions come from the {lead.client_name} script.
        </p>
      )}
      <CallAssistant leadId={lead.id} logAction={logActivity.bind(null, lead.id, fromNext ? '/next' : `/call/${lead.id}`)} />
    </>
  );
}
