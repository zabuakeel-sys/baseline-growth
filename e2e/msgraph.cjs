// Microsoft mailbox through the app's own access (as Kacity does): no sign-in, no password.
// Connect checks permissions with Microsoft; outreach is sent as the mailbox; a reply in its inbox
// is read and becomes a draft. Needs e2e/mock-microsoft.cjs on :3500 and mock-claude on :3300; app with
// APP_SECRET, MICROSOFT_CLIENT_ID=test MICROSOFT_CLIENT_SECRET=test MICROSOFT_TENANT_ID=libra
// MICROSOFT_LOGIN_URL=http://127.0.0.1:3500 MICROSOFT_GRAPH_URL=http://127.0.0.1:3500
// ANTHROPIC_API_KEY=test-key ANTHROPIC_BASE_URL=http://localhost:3300 OUTREACH_BACKGROUND=off OUTREACH_IGNORE_HOURS=1
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const S = process.argv[2] || require('node:os').tmpdir();
const base = 'http://localhost:3100';
const MS = 'http://127.0.0.1:3500';
const psql = (sql) => execSync(`psql -h /var/tmp/bgpg -p 5433 -U app -d bg -tAc "${sql.replace(/"/g, '\\"')}"`).toString().trim();
const sent = () => JSON.parse(fs.readFileSync('/var/tmp/graph-sent.json', 'utf8'));

(async () => {
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  const browser = await chromium.launch();
  const p = await (await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await p.goto(base + '/login');
  await p.fill('input[name=email]', 'owner@example.test');
  await p.fill('input[name=password]', 'testpassword123');
  await p.click('button[type=submit]');
  await p.waitForURL(base + '/');
  const id = psql("SELECT id FROM clients WHERE name LIKE 'LibraPro%'");
  const before = sent().length;
  const connect = async (email) => {
    await p.goto(`${base}/clients/${id}/settings`);
    await p.waitForSelector('#mailbox-h');
    await p.click('summary:has-text("Advanced")');
    await p.fill('input[name=ms_email]', email);
    await p.fill('input[name=ms_from_name]', 'Zain Akeel');
    await p.click('button:has-text("Connect")');
  };

  // The app is not allowed to send: says exactly what is missing
  await fetch(`${MS}/__roles?set=User.Read.All`);
  await connect('zain@libraprofs.example');
  await p.waitForSelector('p.error:has-text("not allowed to send")');
  // Unknown mailbox
  await fetch(`${MS}/__roles?set=Mail.Send,Mail.ReadWrite`);
  await connect('nobody@libra.example');
  await p.waitForSelector('p.error:has-text("No mailbox with that address")');
  // Allowed: connected, no password stored
  await connect('zain@libraprofs.example');
  await p.waitForSelector('p.notice:has-text("Connected zain@libraprofs.example through the Microsoft app")');
  const row = psql(`SELECT auth || '|' || email || '|' || password_enc || '|' || (verified_at IS NOT NULL) FROM client_mailboxes WHERE client_id = ${id}`);
  if (row !== 'graph|zain@libraprofs.example||true') fail(`saved wrong: ${row}`);
  if (!(await p.textContent('section[aria-labelledby=mailbox-h]')).includes('through the Microsoft app')) fail('panel should say how it is connected');
  await p.screenshot({ path: S + '/37-microsoft-app.png', fullPage: false });

  // Outreach goes out as zain@libraprofs.example
  psql(`UPDATE clients SET offer = 'LibraPro cleans offices.', mailing_address = '1 Main St, Troy, MI 48084', outreach_approved_at = now() WHERE id = ${id}`);
  psql(`INSERT INTO leads (client_id, name, email, received_on, status) VALUES (${id}, 'Pat Park', 'pat@p.example', (now() AT TIME ZONE 'America/Detroit')::date, 'new')`);
  await p.goto(base + '/outbox');
  await p.click('text=Run now');
  await p.waitForSelector('p.notice:has-text("Run finished")');
  console.log('run 1:', await p.textContent('p.notice'));
  const out = sent().slice(before);
  const first = out.find((m) => m.to === 'pat@p.example');
  if (!first || first.from !== 'zain@libraprofs.example' || !first.body.content.includes('LibraPro cleans offices.')) fail(`not sent as the mailbox: ${JSON.stringify(out)}`);
  const mid = psql("SELECT message_id FROM outbox WHERE status = 'sent' AND to_email = 'pat@p.example'");
  if (mid !== first?.internetMessageId) fail(`Message-ID should be Microsoft's: ${mid}`);

  // Pat replies; the reply in the inbox is read, matched by thread, and drafted
  await fetch(`${MS}/__inbox`, { method: 'POST', body: JSON.stringify({ user: 'zain@libraprofs.example', internetMessageId: '<pat-1@p.example>', subject: 'RE: Quick question',
    receivedDateTime: new Date().toISOString(), from: { emailAddress: { address: 'pat@p.example', name: 'Pat Park' } }, body: { content: 'Interested. How long does the walkthrough take?' },
    internetMessageHeaders: [{ name: 'In-Reply-To', value: mid }] }) });
  await p.click('text=Run now');
  await p.waitForFunction(() => document.querySelector('p.notice')?.textContent.includes('1 new emails read'));
  if (psql("SELECT status FROM leads WHERE name = 'Pat Park'") !== 'talking') fail('Pat should be talking');
  if (psql(`SELECT client_id FROM replies WHERE message_id = '<pat-1@p.example>'`) !== id) fail('reply should be stored for LibraPro');
  // Approving the draft replies in the same thread, from the mailbox
  await p.goto(base + '/outbox');
  await p.click('text=Approve & send');
  await p.waitForSelector('p.notice:has-text("Reply sent")');
  const reply = sent().slice(before).find((m) => m.replyTo === '<pat-1@p.example>');
  if (!reply || reply.from !== 'zain@libraprofs.example') fail(`reply should be in Pat's thread: ${JSON.stringify(sent().slice(before))}`);

  await browser.close();
  console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
