// Client mailbox + mixed schedule + AI writing, end to end:
//   - connect a business's own mailbox (password stored encrypted), test the connection
//   - the schedule queues emails, puts calls and visits on Today, skips a missed call
//   - the first email carries an AI first line; the HTML version carries the business's logo
//   - a reply becomes an AI draft that waits for approval, is edited, then sent in the thread
// Needs: app started WITHOUT the shared SMTP_/IMAP_ settings, with APP_SECRET (32+ chars),
// ANTHROPIC_API_KEY=test-key ANTHROPIC_BASE_URL=http://localhost:3300 OUTREACH_BACKGROUND=off
// OUTREACH_IGNORE_HOURS=1; e2e/smtp-capture.cjs on :2525, e2e/mock-claude.cjs on :3300, and the
// local IMAP server on :1143 with user sales@libra.example / app-pass-1.
const { chromium } = require('playwright');
const { ImapFlow } = require('imapflow');
const { execSync } = require('child_process');
const fs = require('fs');
const S = process.argv[2] || require('node:os').tmpdir();
const CAPTURE = process.argv[3] || '/var/tmp/sent.json';
const CLAUDE_LOG = process.argv[4] || '/var/tmp/claude-requests.json';
const base = 'http://localhost:3100';
const sent = () => JSON.parse(fs.readFileSync(CAPTURE, 'utf8'));
const psql = (sql) => execSync(`psql -h /var/tmp/bgpg -p 5433 -U app -d bg -tAc "${sql.replace(/"/g, '\\"')}"`).toString().trim();
const BOX = 'sales@libra.example';

async function deliver(raw) {
  const c = new ImapFlow({ host: '127.0.0.1', port: 1143, secure: false, auth: { user: BOX, pass: 'app-pass-1' }, logger: false });
  await c.connect();
  // Start from an empty inbox so earlier runs do not leak in.
  const lock = await c.getMailboxLock('INBOX');
  try { if (c.mailbox.exists) await c.messageFlagsAdd('1:*', ['\\Seen']); } finally { lock.release(); }
  if (raw) await c.append('INBOX', raw, []);
  await c.logout();
}

(async () => {
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  async function runNow(page) {
    const before = (await page.locator('p.notice').count()) ? await page.textContent('p.notice') : '';
    await page.click('text=Run now');
    await page.waitForFunction(([b]) => { const n = document.querySelector('p.notice'); return n && n.textContent !== b && n.textContent.includes('Run finished'); }, [before]);
    return page.textContent('p.notice');
  }
  await deliver(null);
  const browser = await chromium.launch();
  const p = await (await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await p.goto(base + '/login');
  await p.fill('input[name=email]', 'owner@example.test');
  await p.fill('input[name=password]', 'testpassword123');
  await p.click('button[type=submit]');
  await p.waitForURL((u) => !u.pathname.startsWith('/login'));

  const clientId = psql("SELECT id FROM clients WHERE name LIKE 'LibraPro%'");
  psql(`UPDATE clients SET offer = 'LibraPro cleans offices and medical buildings across Metro Detroit.', mailing_address = '100 Example Ave, Detroit, MI 48201',
        visits = true, logo_url = 'https://libra.example/logo.png', contact_name = 'Lina Pro', contact_email = 'owner@libra.example',
        first_step = 'free walkthrough', claim_url = 'https://libra.example/book' WHERE id = ${clientId}`);

  // 1. Connect the business's own mailbox
  await p.goto(`${base}/clients/${clientId}`);
  await p.waitForSelector('#mailbox-h');
  await p.click('summary:has-text("Advanced")');
  await p.selectOption('select[name=provider]', 'other');
  await p.fill('input[name=box_email]', BOX);
  await p.fill('input[name=from_name]', 'Zaino');
  await p.fill('input[name=password]', 'app-pass-1');
  await p.fill('input[name=smtp_host]', '127.0.0.1');
  await p.fill('input[name=smtp_port]', '2525');
  await p.fill('input[name=imap_host]', '127.0.0.1');
  await p.fill('input[name=imap_port]', '1143');
  await p.click('button:has-text("Save and test")');
  await p.waitForSelector('p.notice:has-text("Connected")');
  const stored = psql(`SELECT password_enc FROM client_mailboxes WHERE client_id = ${clientId}`);
  if (!stored.startsWith('v1:') || stored.includes('app-pass-1')) fail('password must be stored encrypted');
  if (!(await p.locator('.pill:has-text("Connected")').count())) fail('connected badge missing');
  await p.screenshot({ path: S + '/28-mailbox.png', fullPage: false, clip: { x: 0, y: (await p.locator('#mailbox-h').boundingBox()).y - 30, width: 1000, height: 420 } });

  // 2. Prospects at different points of the schedule
  const D = "(now() AT TIME ZONE 'America/Detroit')::date";
  const add = (name, email, days, touches, step, extra = '') => psql(
    `INSERT INTO leads (client_id, name, email, phone, address, received_on, touches_sent, cadence_step, status, notes, rating, reviews)
     VALUES (${clientId}, '${name}', '${email}', '248-555-0101', '100 Big Beaver Rd, Troy, MI 48084', ${D} - ${days}, ${touches}, ${step},
     '${touches ? 'following_up' : 'new'}', '${extra}', ${extra ? '4.8' : 'NULL'}, ${extra ? 120 : 'NULL'})`);
  add('Pat Park', 'pat@p.example', 0, 0, 0, 'Medical clinic');      // first email due today
  add('Quinn Quill', 'quinn@q.example', 1, 1, 1);                    // call due today
  add('Rae Reed', 'rae@r.example', 5, 2, 3);                         // visit due today
  add('Sam Stone', 'sam@s.example', 3, 1, 1);                        // call not done, email 2 due: call skipped

  await p.goto(base + '/outbox');
  if (await p.locator('text=The outreach mailbox is not connected yet').count()) fail('should not warn: a client mailbox is connected');
  const r1 = await runNow(p);
  console.log('run 1:', r1);
  if (!r1.includes('2 queued')) fail('expected 2 emails queued (Pat first, Sam second)');
  const lead = (name, cols) => psql(`SELECT ${cols} FROM leads WHERE name = '${name}'`);
  console.log('quinn:', lead('Quinn Quill', "cadence_step || ' ' || next_action_on || ' ' || next_action"));
  console.log('rae:', lead('Rae Reed', "cadence_step || ' ' || next_action"));
  console.log('sam:', lead('Sam Stone', "cadence_step || ' missed ' || steps_missed"));
  if (!lead('Quinn Quill', 'next_action').startsWith('Call: follow up')) fail('Quinn should have a call due');
  if (!lead('Rae Reed', 'next_action').startsWith('Visit: drop in')) fail('Rae should have a visit due (client does visits)');
  if (lead('Sam Stone', "cadence_step || '/' || steps_missed") !== '2/1') fail('Sam: missed call should be skipped');
  const patBody = psql("SELECT body FROM outbox o JOIN leads l ON l.id = o.lead_id WHERE l.name = 'Pat Park'");
  // The opening email is AI-written (the mock echoes the client's offer) and carries the signature.
  if (!patBody.includes('LibraPro cleans offices and medical buildings across Metro Detroit')) fail('AI email should carry the client offer');
  if (!patBody.includes('On behalf of LibraPro Facility Services')) fail('AI email should keep the signature and opt-out');
  if (psql("SELECT o.kind || ' ' || o.step || ' ' || o.client_id FROM outbox o JOIN leads l ON l.id = o.lead_id WHERE l.name = 'Sam Stone'") !== `sequence 2 ${clientId}`) fail('Sam email should be step 2');

  // Calls and visits are on Today
  await p.goto(base + '/today?who=all');
  const today = await p.textContent('main');
  if (!today.includes('Call: follow up') || !today.includes('Visit: drop in')) fail('Today should list the call and the visit');
  await p.screenshot({ path: S + '/29-today-schedule.png', fullPage: true });

  // 3. Approve and send from the business's own mailbox, with the logo in the HTML version
  await p.goto(base + '/outbox');
  await p.click('text=Approve ticked');
  await p.waitForSelector('p.notice:has-text("approved")');
  console.log('run 2:', await runNow(p));
  const out = sent();
  const pat = out.find((m) => m.to.includes('pat@'));
  if (out.length !== 2 || !pat) fail(`expected 2 sent, got ${out.length}`);
  else {
    if (!pat.from.includes(BOX) || !pat.from.includes('Zaino')) fail(`wrong sender: ${pat.from}`);
    if (!pat.html || !pat.html.includes('<img src="https://libra.example/logo.png"')) fail('logo missing from HTML');
    if (!pat.text.includes('Zaino\nOn behalf of LibraPro')) fail('signature wrong');
  }
  if (lead('Pat Park', "touches_sent || '/' || cadence_step") !== '1/1') fail('Pat counters should advance');
  if (psql(`SELECT count(*) FROM outbox WHERE sent_via = 'client:${clientId}'`) !== '2') fail('sends should be recorded against the client mailbox');

  // 4. A call logged on Today moves Quinn past the call step
  await p.goto(base + '/today?who=all');
  const card = p.locator('article.lead', { hasText: 'Quinn Quill' }).first();
  if (!(await card.locator('input[name=outcome]').first().isVisible())) await card.locator('summary:has-text("Log a call or visit")').click();
  await card.locator('input[name=channel][value=call]').check({ force: true });
  await card.locator('input[name=outcome][value=no_answer]').check({ force: true });
  await card.locator('form.log-form button[type=submit]').click();
  await p.waitForSelector('p.notice:has-text("logged")');
  if (lead('Quinn Quill', 'cadence_step') !== '2') fail('logged call should advance the schedule');

  // 5. Pat replies; an AI draft waits for approval, gets edited, and goes out in the same thread
  await deliver(`From: Pat Park <pat@p.example>\r\nTo: ${BOX}\r\nSubject: Re: Quick question from LibraPro Facility Services\r\nMessage-ID: <pat-reply-1@p.example>\r\n` +
    `In-Reply-To: ${pat.messageId}\r\nReferences: ${pat.messageId}\r\nDate: ${new Date().toUTCString()}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n` +
    'Sounds interesting. How long does the walkthrough take?\r\n');
  await p.goto(base + '/outbox');
  console.log('run 3:', await runNow(p));
  if (lead('Pat Park', 'status') !== 'talking') fail('Pat should be talking');
  if (psql(`SELECT client_id FROM replies WHERE message_id = '<pat-reply-1@p.example>'`) !== clientId) fail('reply should be stored against the client mailbox');
  const draftRow = psql("SELECT status || '|' || intent FROM outbox WHERE kind = 'reply'");
  if (draftRow !== 'pending|wants_meeting') fail(`draft should wait for approval with an intent, got ${draftRow}`);
  if (!(await p.textContent('#drafts-h')).includes('(1)')) fail('draft not listed');
  if (!(await p.locator('.pill:has-text("Wants to meet or talk")').count())) fail('intent not shown');
  const asked = JSON.parse(fs.readFileSync(CLAUDE_LOG, 'utf8')).find((r) => String(r.body.system).includes('draft a reply'));
  if (!asked || !asked.body.messages[0].content.includes('How long does the walkthrough take')) fail('draft request should include what Pat wrote');
  if (!asked.body.messages[0].content.includes('https://libra.example/book')) fail('draft request should include the booking link');
  // Automatic mode never sends reply drafts on its own
  psql('UPDATE outreach_settings SET auto_send = true');
  await runNow(p);
  if (sent().some((m) => m.to.includes('pat@') && m.inReplyTo === '<pat-reply-1@p.example>')) fail('draft sent without approval');
  await p.screenshot({ path: S + '/30-reply-draft.png', fullPage: true });
  const box = p.locator('textarea[name=body]');
  await box.fill((await box.inputValue()).replace('You can book here', 'Thursday at 10 works on our side. You can book here'));
  const before = sent().length;
  await p.click('text=Approve & send');
  await p.waitForSelector('p.notice:has-text("Reply sent")');
  const reply = sent().slice(before).find((m) => m.to.includes('pat@'));
  if (!reply) fail('reply not sent');
  else {
    if (reply.inReplyTo !== '<pat-reply-1@p.example>') fail('reply should be in the same thread');
    if (!reply.text.includes('Thursday at 10 works') || !reply.text.includes('On behalf of LibraPro')) fail('edited text or signature missing');
    if (!reply.subject.startsWith('Re: Quick question')) fail('subject should be Re:');
    if (!reply.from.includes(BOX)) fail('reply should come from the client mailbox');
  }
  if (!sent().some((m) => m.subject.startsWith('Reply from Pat Park'))) fail('rep alert should go out (via the client mailbox when there is no shared one)');
  if (lead('Pat Park', 'touches_sent') !== '1') fail('a reply must not count as a schedule email');

  await browser.close();
  console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
