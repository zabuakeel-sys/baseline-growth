// Dry-run setup: configure AutoAt and LibraPro with their plays, approved emails, autopilot and a
// search each, so the engine can find, score and queue for them. No real sending.
import pg from 'pg';
import { applyPlay } from '../src/lib/plays.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (s, p) => pool.query(s, p);

const CLIENTS = [
  { like: 'AutoAt', play: 'claim_listing', offer: 'AutoAt is a marketplace where drivers find and book local repair shops.',
    addr: '500 Woodward Ave, Detroit, MI 48226', claim: 'https://autoat.org/claim', what: 'auto repair', where: 'Detroit, MI' },
  { like: 'LibraPro%', play: 'free_walkthrough', offer: 'LibraPro cleans offices and medical buildings across Metro Detroit.',
    addr: '100 Example Ave, Troy, MI 48084', claim: 'https://libraprofs.com/book', what: 'medical clinic', where: 'Troy, MI' },
];

for (const c of CLIENTS) {
  const row = (await q(`SELECT id, name FROM clients WHERE name LIKE $1`, [c.like])).rows[0];
  if (!row) { console.log('missing client', c.like); continue; }
  const a = applyPlay(c.play, { businessName: row.name });
  await q(
    `UPDATE clients SET status='active', autopilot=true, daily_prospects=5, play=$2, visits=$3,
       goal=$4, offer=$5, claim_label=$6, mailing_address=$7, claim_url=$8,
       outreach_subject=$9, outreach_body=$10, outreach_approved_at=now() WHERE id=$1`,
    [row.id, a.play, a.visits, a.goal, c.offer, a.claim_label, c.addr, c.claim, a.outreach_subject, a.outreach_body]);
  await q(`DELETE FROM targets WHERE client_id=$1`, [row.id]);
  await q(`INSERT INTO targets (client_id, what, location, max_results) VALUES ($1,$2,$3,10)`, [row.id, c.what, c.where]);
  console.log(`set up ${row.name}: play=${a.play}, search="${c.what} in ${c.where}"`);
}
// A shared outreach mailbox so emails QUEUE (fake creds; nothing is approved or sent in the dry run).
await q(`UPDATE outreach_settings SET auto_send=false WHERE id=1`);
await pool.end();
console.log('done');
