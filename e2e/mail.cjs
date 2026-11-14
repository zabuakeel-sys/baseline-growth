const { chromium } = require('playwright');
const { ImapFlow } = require('imapflow');
const { execSync } = require('child_process');
const fs = require('fs');
const S = process.argv[2] || require('node:os').tmpdir(); // where screenshots go
const CAPTURE = process.argv[3] || '/var/tmp/sent.json'; // written by e2e/smtp-capture.cjs
const base = 'http://localhost:3100';
const sent = () => JSON.parse(fs.readFileSync(CAPTURE, 'utf8'));
const psql = (sql) => execSync(`psql -h /var/tmp/bgpg -p 5433 -U app -d bg -tAc "${sql}"`).toString().trim();
async function deliver(raw) {
  const c = new ImapFlow({ host: '127.0.0.1', port: 1143, secure: false, auth: { user: 'outreach', pass: 'testpass' }, logger: false });
  await c.connect(); await c.append('INBOX', raw, []); await c.logout();
}
const reply = ({ from, to, subject, inReplyTo, body, extra = '' }) =>
  `From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nMessage-ID: <${Math.random().toString(36).slice(2)}@prospect.example>\r\n` +
  (inReplyTo ? `In-Reply-To: ${inReplyTo}\r\nReferences: ${inReplyTo}\r\n` : '') + extra +
  `Date: ${new Date().toUTCString()}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`;

(async () => {
  // Clicks Run now and waits for THIS run's result, not the previous one still on screen.
  async function runNow(page, waitFor = 'Run finished') {
    const before = (await page.locator('p.notice').count()) ? await page.textContent('p.notice') : '';
    await page.click('text=Run now');
    await page.waitForFunction(([b, w]) => { const n = document.querySelector('p.notice'); return n && n.textContent !== b && n.textContent.includes(w); }, [before, waitFor]);
    return page.textContent('p.notice');
  }
  const browser = await chromium.launch();
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  const p = await (await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await p.goto(base + '/login');
  await p.fill('input[name=email]', 'owner@example.test');
  await p.fill('input[name=password]', 'testpassword123');
  await p.click('button[type=submit]');
  await p.waitForURL((u) => !u.pathname.startsWith('/login')); await p.goto(base + '/');

  // Client setup: offer, contact email; leave the address out at first
  await p.click('.biz-card:has-text("LibraPro Facility Services")');
  await p.waitForURL(/\/clients\/\d+$/);
  const clientUrl = p.url().split('#')[0].split('?')[0];
  await p.goto(clientUrl + '/settings');
  await p.waitForSelector('#details-h');
  await p.fill('input[name=contact_email]', 'owner@libra.example');
  await p.fill('input[name=contact_name]', 'Lina Pro');
  await p.fill('input[name=offer]', 'LibraPro handles commercial cleaning for offices in Michigan and Ohio.');
  await p.click('text=Save client');
  await p.waitForSelector('p.notice');
  await p.goto(clientUrl + '/prospects');
  await p.waitForSelector('#leads-h');
  for (const [name, email] of [['Ann Able', 'ann@a.example'], ['Bob Baker', 'bob@b.example'], ['Cy Cole', 'cy@c.example'], ['Di Dunn', 'di@d.example']]) {
    if (!(await p.locator('input[name=need]').isVisible())) await p.click('summary:has-text("Add one by hand")');
    await p.fill('input[name=name]', name);
    await p.fill('input[name=email]', email);
    await p.click('text=Add prospect');
    await p.waitForSelector(`article.lead:has-text("${name}")`);
  }

  // No mailing address: nothing queues, and the Outbox says why
  await p.goto(base + '/outbox');
  if (!(await runNow(p)).includes('0 queued')) fail('should not queue without a mailing address');
  if (!(await p.locator('text=Not queued: no mailing address').count())) fail('missing-address warning not shown');

  await p.goto(clientUrl + '/settings');
  await p.waitForSelector('#details-h');
  await p.fill('input[name=mailing_address]', '100 Example Ave, Detroit, MI 48201');
  await p.click('text=Save client');
  await p.waitForSelector('p.notice');

  // Approve-first: 4 queued, none sent
  await p.goto(base + '/outbox');
  console.log('run 1:', await runNow(p));
  if (sent().length) fail('sent before approval');
  // Prospect cards say the message is queued, with no manual send button
  await p.goto(base + '/leads');
  const annCard = p.locator('article.lead', { hasText: 'Ann Able' });
  if (!(await annCard.textContent()).includes('waiting for approval')) fail('card should say queued for approval');
  if (await annCard.locator('text=I sent it').count()) fail('manual send offered while queued: double-send risk');
  await p.goto(base + '/outbox');
  await p.screenshot({ path: S + '/19-outbox.png', fullPage: true });
  await p.click('text=Approve ticked');
  await p.waitForSelector('p.notice:has-text("approved")');
  console.log('run 2:', await runNow(p));
  const first = sent();
  console.log('sent:', first.map((m) => `${m.to} | ${m.subject}`));
  if (first.length !== 4) fail('expected 4 sent');
  const ann = first.find((m) => m.to.includes('ann@'));
  if (!ann.text.includes('100 Example Ave') || !ann.text.includes('reply "no thanks"') || ann.subject !== 'Quick question from LibraPro Facility Services') fail('message content wrong');
  if (!ann.from.includes('zaino@outreach.example')) fail('wrong sender address');
  // Shared mailbox shows the business name as the sender, but the signature stays the human name.
  if (!ann.from.includes('LibraPro Facility Services')) fail(`sender name should be the business: ${ann.from}`);
  if (!ann.text.includes('Zaino\nOn behalf of LibraPro Facility Services')) fail('signature should be the human name, on behalf of the business');
  const id = (who) => first.find((m) => m.to.includes(who)).messageId;

  // Replies arrive in the mailbox
  await deliver(reply({ from: 'Ann Able <ann@a.example>', to: 'zaino@outreach.example', subject: 'Re: Quick question from LibraPro Facility Services', inReplyTo: id('ann@'),
    body: `Yes, we are unhappy with our current cleaner. Call me Thursday at 2.\n\nOn Tue, Nov 17, 2026 at 10:00 AM Zaino <zaino@outreach.example> wrote:\n> If you'd rather not hear from us, reply "no thanks"` }));
  await deliver(reply({ from: 'bob@b.example', to: 'zaino@outreach.example', subject: 'Re: Quick question', inReplyTo: id('bob@'), body: 'No thanks.' }));
  await deliver(reply({ from: 'cy@c.example', to: 'zaino@outreach.example', subject: 'Out of Office: Quick question', inReplyTo: id('cy@'), body: 'I am away until Monday.', extra: 'Auto-Submitted: auto-replied\r\n' }));
  await deliver(reply({ from: 'Mail Delivery Subsystem <mailer-daemon@mx.example>', to: 'zaino@outreach.example', subject: 'Delivery Status Notification (Failure)',
    body: `Address not found: di@d.example\nOriginal Message-ID: ${id('di@')}` }));
  await deliver(reply({ from: 'stranger@x.example', to: 'zaino@outreach.example', subject: 'Hello', body: 'Who is this?' }));

  console.log('run 3:', await runNow(p));
  const state = psql("SELECT string_agg(name || '=' || status || coalesce(':' || nullif(lost_reason, ''), ''), ', ' ORDER BY name) FROM leads");
  console.log('states:', state);
  for (const want of ['Ann Able=talking', 'Bob Baker=opted_out', 'Cy Cole=following_up', 'Di Dunn=lost:Email bounced']) if (!state.includes(want)) fail('expected ' + want);
  if (!(await p.locator('text=no matching prospect').count())) fail('stranger email should be listed as unmatched');
  const alert = sent().find((m) => m.subject.startsWith('Reply from Ann Able'));
  if (!alert) fail('no reply alert to the rep');
  else if (!alert.to.includes('owner@example.test') || !alert.text.includes('Call me Thursday at 2.')) fail('reply alert content wrong');
  await p.goto(base + '/today?who=all');
  if (!(await p.locator('section[aria-labelledby=replied-h]').textContent()).includes('Ann Able')) fail('Ann should top the Today list');
  await p.goto(base + '/outbox');
  await p.screenshot({ path: S + '/20-replies.png', fullPage: true });

  // Ann's card shows her words; hand her to the client
  await p.goto(base + '/leads');
  const annNow = p.locator('article.lead', { hasText: 'Ann Able' });
  if (!(await annNow.textContent()).includes('Call me Thursday at 2.')) fail('reply not shown on card');
  if ((await annNow.textContent()).includes('rather not hear')) fail('quoted thread should be hidden');
  await annNow.locator('button:has-text("Email to LibraPro")').click();
  await p.waitForSelector('p.notice:has-text("Emailed to the client")');
  const intro = sent().find((m) => m.to.includes('owner@libra.example'));
  if (!intro) fail('no introduction email to client');
  else {
    console.log('intro subject:', intro.subject);
    if (!intro.text.includes('Call me Thursday at 2.') || !intro.text.includes('ann@a.example') || !intro.text.startsWith('Hi Lina,')) fail('introduction content wrong');
  }
  if (psql("SELECT status FROM leads WHERE name = 'Ann Able'") !== 'introduced') fail('Ann should be introduced');

  // Follow-up for Cy three days later is threaded, and automatic mode sends without approval
  psql("UPDATE leads SET received_on = received_on - 3 WHERE name = 'Cy Cole'");
  await p.goto(base + '/outbox');
  await p.check('input[name=auto_send]');
  await p.click('text=Save settings');
  await p.waitForSelector('p.notice:has-text("Settings saved")');
  console.log('run 4:', await runNow(p));
  const cyFollow = sent().filter((m) => m.to.includes('cy@'));
  if (cyFollow.length !== 2) fail('Cy should have a follow-up');
  else {
    console.log('cy follow-up:', cyFollow[1].subject, '| in-reply-to matches first:', cyFollow[1].inReplyTo === id('cy@'));
    if (!cyFollow[1].subject.startsWith('Re: ') || cyFollow[1].inReplyTo !== id('cy@')) fail('follow-up not threaded');
  }
  if (sent().filter((m) => m.to.includes('bob@')).length !== 1) fail('opted-out Bob was emailed again');

  // Daily limit: with a limit equal to today's count, nothing more goes out
  psql("UPDATE outreach_settings SET daily_limit = (SELECT count(*) FROM outbox WHERE status = 'sent')");
  psql("UPDATE leads SET received_on = received_on - 4 WHERE name = 'Cy Cole'");
  const before = sent().length;
  await runNow(p, 'Daily limit reached');
  if (sent().length !== before) fail('sent past the daily limit');

  console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
  await browser.close();
})();
