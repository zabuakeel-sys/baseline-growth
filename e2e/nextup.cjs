// The guided flow: the owner's Home says what needs them, approving a business's first email once
// turns its sending on, and Next up walks a seller through prospects one at a time.
// Needs: fixtures loaded, APP_SECRET set, OUTREACH_BACKGROUND=off.
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const S = process.argv[2] || require('node:os').tmpdir();
const base = 'http://localhost:3100';
const psql = (sql) => execSync(`psql -h /var/tmp/bgpg -p 5433 -U app -d bg -tAc "${sql.replace(/"/g, '\\"')}"`).toString().trim();

(async () => {
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  const browser = await chromium.launch();
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await p.goto(base + '/login');
  await p.fill('input[name=email]', 'owner@example.test');
  await p.fill('input[name=password]', 'testpassword123');
  await p.click('button[type=submit]');
  await p.waitForURL(base + '/');

  // The sidebar nav (shown as a top bar at phone width)
  const nav = (await p.locator('.mtop a').allTextContents()).map((s) => s.trim());
  if (!nav.includes('Today') || !nav.includes('Overview') || !nav.includes('Businesses')) fail(`nav wrong: ${nav.join('|')}`);

  // LibraPro has its answers and a tested mailbox: Home asks to approve its first email
  const id = psql("SELECT id FROM clients WHERE name LIKE 'LibraPro%'");
  const answers = JSON.stringify({ name: 'LibraPro Facility Services', contact_name: 'Lina', contact_email: 'l@libra.example', offer: 'x', why_us: 'x',
    first_step: 'free walkthrough', who: 'dental office', where: 'Troy, MI', customer_value: '900', mailing_address: '100 Example Ave, Detroit, MI 48201' });
  psql(`UPDATE clients SET onboarding = '${answers}'::jsonb, offer = 'LibraPro cleans offices and medical buildings across Metro Detroit.',
        mailing_address = '100 Example Ave, Detroit, MI 48201' WHERE id = ${id}`);
  psql(`INSERT INTO client_mailboxes (client_id, from_name, email, provider, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, imap_secure, username, password_enc, verified_at)
        VALUES (${id}, 'Zaino', 'sales@libra.example', 'other', 'smtp.libra.example', 465, true, 'imap.libra.example', 993, true, 'sales@libra.example', 'v1:x:x:x', now())`);
  await p.goto(base + '/');
  const home = await p.textContent('main');
  if (!home.includes('LibraPro Facility Services') || !home.includes('approve the first email')) fail('Overview should show LibraPro needing email approval');
  if (!home.includes('AutoAt') || !home.includes("finish the owner's answers")) fail('Overview should show AutoAt at its first setup step');
  await p.screenshot({ path: S + '/31-home.png', fullPage: true });

  // Write and perfect the email on the Settings page, then start sending (two separate steps).
  await p.goto(`${base}/clients/${id}/settings#approve-h`);
  await p.waitForSelector('#approve-h');
  if (!/\[First name\]|{first_name}/.test(await p.inputValue('textarea[name=body]'))) fail('starter email should use a first-name placeholder');
  await p.fill('input[name=subject]', 'Claim your free listing');
  await p.fill('textarea[name=body]', 'Hi {first_name},\n\nQuick note about LibraPro for your shop. Want in?');
  await p.click('button:has-text("Save email")');
  await p.waitForSelector('p.notice:has-text("Email saved")');
  if (psql(`SELECT outreach_subject FROM clients WHERE id = ${id}`) !== 'Claim your free listing') fail('custom email not saved');
  await p.click('button:has-text("Start sending to prospects")');
  await p.waitForSelector('p.notice:has-text("Approved")');
  if (psql(`SELECT outreach_approved_at IS NOT NULL FROM clients WHERE id = ${id}`) !== 't') fail('approval not saved');
  await p.goto(base + '/');
  if ((await p.textContent('main')).includes('LibraPro Facility Services — approve the first email')) fail('approved business should no longer ask for email approval');
  if (!(await p.textContent('main')).includes('Emailing on its own')) fail('Overview should show LibraPro as live after approval');
  await p.goto(`${base}/clients/${id}`);
  if ((await p.textContent('main')).includes('Still setting up')) fail('approved business should show the live work screen, not setup');
  if (!(await p.locator('a:has-text("See the email")').count())) fail('live business page should show the running status');

  // Today: the day's work grouped under its business. A reply, a due call, a new prospect, a call not due yet.
  const D = "(now() AT TIME ZONE 'America/Detroit')::date";
  const add = (name, status, on, action, extra = '') => psql(
    `INSERT INTO leads (client_id, name, phone, email, address, received_on, status, next_action_on, next_action, notes)
     VALUES (${id}, '${name}', '248-555-01${String(name.length).padStart(2, '0')}', '', '100 Big Beaver Rd, Troy, MI 48084', ${D} - 2, '${status}', ${on}, '${action}', '${extra}')`);
  add('Una Reply', 'talking', D, 'They replied: call them now');
  add('Vic Due', 'following_up', D, 'Call: follow up (they have 1 email from us), step 2 of 7');
  add('Wes New', 'new', 'NULL', '');
  add('Xia Later', 'following_up', `${D} + 3`, 'Call: follow up');

  await p.goto(base + '/next');
  await p.waitForSelector('.biz-day');
  const name = () => p.textContent('#up-name');
  // One business block holds today's due leads; businesses are never blended together.
  if ((await p.locator('.biz-day').count()) !== 1) fail('one business block expected');
  if (!(await p.textContent('.biz-day .bd-head')).includes('LibraPro')) fail('business header missing');
  const listed = (await p.locator('.lr-name').allTextContents()).map((s) => s.trim());
  if (!['Una Reply', 'Vic Due', 'Wes New'].every((n) => listed.includes(n))) fail(`list wrong: ${listed.join(',')}`);
  if (listed.includes('Xia Later')) fail('a call not due yet should not show');
  if (!(await p.textContent('.next-up')).includes('3 to contact')) fail('should say 3 to contact');
  // The reply sits at the top of the block with a Replied chip
  if (!(await p.locator('.lead-row').first().textContent()).includes('Una Reply')) fail('the reply should be first');
  if (!(await p.locator('.lead-row:has-text("Una Reply") .r-replied').count())) fail('reply chip missing');
  await p.screenshot({ path: S + '/32-today-list.png', fullPage: true });

  // Open the reply -> its full researched detail
  await p.locator('.lead-row', { hasText: 'Una Reply' }).click();
  await p.waitForSelector('.research');
  if ((await name()) !== 'Una Reply') fail(`detail name wrong, got ${await name()}`);
  if (!(await p.locator('.r-tag:has-text("Replied")').count())) fail('reason tag missing on detail');
  if (!(await p.locator('a.call[href^="tel:"]').count())) fail('call button missing');
  if (!(await p.locator('.research:has-text("Our outreach")').count())) fail('research block missing');
  await p.screenshot({ path: S + '/33-lead-detail.png', fullPage: true });
  // Log the call -> back to the list, the lead is gone
  await p.click('button[value=talked]');
  await p.waitForSelector('p.notice:has-text("logged")');
  await p.waitForSelector('.biz-day');
  if ((await p.locator('.lr-name').allTextContents()).map((s) => s.trim()).includes('Una Reply')) fail('a logged lead should leave the list');

  // Notes save from the detail
  await p.locator('.lead-row', { hasText: 'Wes New' }).click();
  await p.waitForSelector('.research');
  await p.fill('input[name=notes]', 'Rang twice');
  await p.click('button[value=no_answer]');
  await p.waitForSelector('p.notice:has-text("logged")');
  if (psql("SELECT a.notes FROM activities a JOIN leads l ON l.id = a.lead_id WHERE l.name = 'Wes New'") !== 'Rang twice') fail('notes not saved');

  // Booking a meeting from a lead's detail
  await p.locator('.lead-row', { hasText: 'Vic Due' }).click();
  await p.waitForSelector('.research');
  await p.click('summary:has-text("Booked a meeting")');
  await p.fill('input[name=time]', '14:30');
  await p.click('button:has-text("Save meeting")');
  await p.waitForSelector('p.notice:has-text("booked")');
  if (psql("SELECT l.status || ' ' || (SELECT count(*) FROM meetings m WHERE m.lead_id = l.id) || ' ' || (SELECT outcome FROM activities a WHERE a.lead_id = l.id) FROM leads l WHERE l.name = 'Vic Due'") !== 'talking 1 meeting_booked') fail('meeting should be booked and logged');
  if (!(await p.locator('.meetings-today').count())) fail('today\'s meeting should show at the top');
  if (!(await p.locator('text=You are clear for today').count())) fail('queue should be empty');
  await p.screenshot({ path: S + '/34-today-clear.png', fullPage: true });

  // A new customer: a referral ask shows inside its business block, and the names become prospects
  psql(`INSERT INTO leads (client_id, name, phone, received_on, status, customer_since, closed_on, won_by)
        VALUES (${id}, 'Yara Won', '248-555-0199', ${D} - 20, 'won', ${D} - 2, ${D} - 2, (SELECT id FROM users WHERE email = 'owner@example.test'))`);
  await p.goto(base + '/next');
  await p.waitForSelector('.biz-day');
  if (!(await p.locator('.lead-row:has-text("Yara Won") .lr-tag:has-text("Referrals")').count())) fail('referral ask should show in the business block');
  await p.locator('.lead-row', { hasText: 'Yara Won' }).click();
  await p.waitForSelector('.r-tag:has-text("Ask for referrals")');
  await p.screenshot({ path: S + '/35-referral-ask.png', fullPage: true });
  await p.fill('input[name=name1]', 'Zed Friend');
  await p.fill('input[name=phone1]', '248-555-0177');
  await p.click('button:has-text("Save referrals")');
  await p.waitForSelector('p.notice:has-text("referral")');
  if (psql("SELECT source || ' ' || notes FROM leads WHERE name = 'Zed Friend'") !== 'Referral Referred by Yara Won') fail('referral should be a new prospect');
  if (psql("SELECT referral_asked FROM leads WHERE name = 'Yara Won'") !== 't') fail('ask should be marked done');

  await browser.close();
  console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
