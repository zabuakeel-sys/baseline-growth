import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { requireUser } from '@/lib/auth';
import { claimLink, getLead } from '@/lib/leads';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

const stars = (r: number) => '★★★★★'.slice(0, Math.round(r)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(r));

/**
 * The personal page a rep shows a business owner on their phone: their own business, what the
 * client offers them, and a QR code to claim or book on the spot. The link carries a ref code so
 * the client can tell the signup came from us.
 */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const lead = await getLead(id);
  if (!lead) notFound();
  const link = claimLink(lead.client_claim_url, lead.id);
  const qr = link ? await QRCode.toString(link, { type: 'svg', margin: 1, width: 220, errorCorrectionLevel: 'M' }) : '';
  const claimLabel = (await query<{ claim_label: string }>('SELECT claim_label FROM clients WHERE id = $1', [lead.client_id])).rows[0]?.claim_label || 'Get started';

  return (
    <div className="preview">
      <p className="no-print"><Link href={`/clients/${lead.client_id}#leads-h`}>Back to {lead.client_name}</Link></p>
      <p className="muted" style={{ margin: 0 }}>Prepared for you by {lead.client_name}</p>
      <h1 className="preview-name">{lead.name}</h1>
      {lead.rating != null && (
        <p className="preview-rating"><span aria-hidden="true">{stars(Number(lead.rating))}</span> {Number(lead.rating).toFixed(1)} · {lead.reviews ?? 0} reviews</p>
      )}
      {lead.address && <p className="muted" style={{ marginTop: 0 }}>{lead.address.replace(/,\s*USA$/, '')}</p>}
      <div className="card preview-offer">
        <p style={{ margin: 0, fontSize: 18 }}>{lead.client_offer || `${lead.client_name} would like to work with you.`}</p>
      </div>
      {link ? (
        <div className="preview-claim">
          <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label={`QR code for ${claimLabel}`} />
          <a className="button big" href={link} target="_blank" rel="noopener noreferrer">{claimLabel}</a>
          <p className="muted" style={{ fontSize: 13 }}>Scan with your phone camera, or tap the button.</p>
        </div>
      ) : (
        <p className="muted">Add a claim or booking link for {lead.client_name} under Rep tools on its client page to show a QR code here.</p>
      )}
    </div>
  );
}
