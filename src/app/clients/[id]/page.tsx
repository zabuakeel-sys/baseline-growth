import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getClient } from '@/lib/clients';
import { formatCents } from '@/lib/money';
import { saveBaseline, updateClient } from '../actions';
import ClientForm from '../ClientForm';
import ActionForm from '../../ActionForm';

export const dynamic = 'force-dynamic';

const dollars = (cents: number | null | undefined) => (cents === null || cents === undefined ? '' : String(cents / 100));
const plain = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

export default async function ClientPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  const isOwner = user.role === 'owner';
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();
  const found = await getClient(id);
  if (!found) notFound();
  const { client, baseline } = found;
  const { saved } = await searchParams;
  const locked = Boolean(baseline?.signed_off) && !isOwner;

  return (
    <>
      <p><Link href="/">Back to clients</Link></p>
      <h1>{client.name}</h1>
      <p className="sub">
        {client.industry || 'No industry set'}
        {isOwner && client.monthly_fee_cents > 0 && <> · {formatCents(client.monthly_fee_cents)}/mo + {client.bonus_percent}% of growth</>}
      </p>
      {saved && <p className="notice" role="status">{saved}.</p>}

      <section className="card" aria-labelledby="baseline-h">
        <h2 id="baseline-h">Baseline</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          The client&apos;s numbers before we start. The growth bonus is measured against monthly revenue here, so get it
          confirmed by the client and mark it signed.
        </p>
        {locked ? (
          <p>Signed off by {baseline?.signed_off_by}. Only the owner can change a signed baseline.</p>
        ) : (
          <ActionForm className="grid" action={saveBaseline.bind(null, id)}>
            <label>Monthly revenue ($)<input name="monthly_revenue" inputMode="decimal" defaultValue={dollars(baseline?.monthly_revenue_cents)} placeholder="50000" /></label>
            <label>Inquiries per month<input name="monthly_inquiries" inputMode="numeric" defaultValue={plain(baseline?.monthly_inquiries)} /></label>
            <label>Close rate (%)<input name="close_rate_percent" inputMode="decimal" defaultValue={plain(baseline?.close_rate_percent)} /></label>
            <label>Average sale ($)<input name="avg_sale" inputMode="decimal" defaultValue={dollars(baseline?.avg_sale_cents)} /></label>
            <label>Repeat rate (%)<input name="repeat_rate_percent" inputMode="decimal" defaultValue={plain(baseline?.repeat_rate_percent)} /></label>
            <label>Measured on<input name="measured_on" type="date" defaultValue={baseline?.measured_on ?? ''} /></label>
            <label className="check full"><input type="checkbox" name="signed_off" defaultChecked={baseline?.signed_off} style={{ minHeight: 0 }} /> Client has confirmed these numbers</label>
            <label>Confirmed by (name at client)<input name="signed_off_by" defaultValue={baseline?.signed_off_by} /></label>
            <div className="actions full"><button type="submit">Save baseline</button></div>
          </ActionForm>
        )}
      </section>

      <section className="card" aria-labelledby="details-h">
        <h2 id="details-h">Details{isOwner ? ' and deal terms' : ''}</h2>
        <ClientForm action={updateClient.bind(null, id)} client={client} showTerms={isOwner} submitLabel="Save client" />
      </section>
    </>
  );
}
