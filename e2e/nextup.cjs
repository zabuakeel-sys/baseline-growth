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

  // The menu is short
  const nav = (await p.locator('header nav a').allTextContents()).join('|');
  if (nav !== 'Home|Next up|Businesses|Team|Money') fail(`menu should be Home, Next up, Businesses, Team, Money; got ${nav}`);

  // LibraPro has its answers and a tested mailbox: Home asks to approve its first email
  const id = psql("SELECT id FROM clients WHERE name LIKE 'LibraPro%'");
  const answers = JSON.stringify({ name: 'LibraPro Facility Services', contact_name: 'Lina', contact_email: 'l@libra.example', offer: 'x', why_us: 'x',
    first_step: 'free walkthrough', who: 'dental office', where: 'Troy, MI', customer_value: '900', mailing_address: '100 Example Ave, Detroit, MI 48201' });
  psql(`UPDATE clients SET onboarding = '${answers}'::jsonb, offer = 'LibraPro cleans offices and medical buildings across Metro Detroit.',
        mailing_address = '100 Example Ave, Detroit, MI 48201' WHERE id = ${id}`);
  psql(`INSERT INTO client_mailboxes (client_id, from_name, email, provider, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, imap_secure, username, password_enc, verified_at)
        VALUES (${id}, 'Zaino', 'sales@libra.example', 'other', 'smtp.libra.example', 465, true, 'imap.libra.example', 993, true, 'sales@libra.example', 'v1:x:x:x', now())`);
  await p.goto(base + '/');
  const todo = await p.textContent('section[aria-labelledby=todo-h]');
  if (!todo.includes('LibraPro Facility Services: approve the first email')) fail('Home should ask to approve LibraPro\'s first email');
  if (!todo.includes('LibraPro cleans offices and medical buildings across Metro Detroit.')) fail('the email to approve should be shown');
  if (!todo.includes('AutoAt: finish the owner\'s answers')) fail('AutoAt should be at its first setup step');
  await p.screenshot({ path: S + '/31-home.png', fullPage: true });
  await p.click('button:has-text("Looks good, start sending")');
  await p.waitForSelector('p.notice:has-text("Approved")');
  if (psql(`SELECT outreach_approved_at IS NOT NULL FROM clients WHERE id = ${id}`) !== 't') fail('approval not saved');
  if ((await p.textContent('section[aria-labelledby=todo-h]')).includes('approve the first email')) fail('approved business should leave the list');
  await p.goto(`${base}/clients/${id}`);
  if (!(await p.locator('.steps li.done').count()) || !(await p.locator('text=Sending on its own').count())) fail('business page should show setup steps and sending on');
  await p.goto(base + '/clients');
  if (!(await p.textContent('table')).includes('Starting')) fail('Businesses should show LibraPro as starting');

  // Next up: a reply, a due call, a new prospect, a call not due yet
  const D = "(now() AT TIME ZONE 'America/Detroit')::date";
  const add = (name, status, on, action, extra = '') => psql(
    `INSERT INTO leads (client_id, name, phone, email, address, received_on, status, next_action_on, next_action, notes)
     VALUES (${id}, '${name}', '248-555-01${String(name.length).padStart(2, '0')}', '', '100 Big Beaver Rd, Troy, MI 48084', ${D} - 2, '${status}', ${on}, '${action}', '${extra}')`);
  add('Una Reply', 'talking', D, 'They replied: call them now');
  add('Vic Due', 'following_up', D, 'Call: follow up (they have 1 email from us), step 2 of 7');
  add('Wes New', 'new', 'NULL', '');
  add('Xia Later', 'following_up', `${D} + 3`, 'Call: follow up');

  psql("UPDATE users SET goal_calls = 3 WHERE email = 'owner@example.test'");
  await p.goto(base + '/next');
  if (!(await p.textContent('.goals')).includes('Calls: 0 of 3')) fail('goal should show on Next up');
  const name = () => p.textContent('#up-name');
  if ((await name()) !== 'Una Reply') fail(`replies come first, got ${await name()}`);
  if (!(await p.locator('.pill:has-text("They replied")').count())) fail('reason label missing');
  if (!(await p.locator('a.button.big[href^="tel:"]').count())) fail('call button missing');
  if (!(await p.textContent('.next-up')).includes('3 to go')) fail('should have 3 to go (later call not due)');
  await p.screenshot({ path: S + '/32-next-up-phone.png', fullPage: true });
  await p.click('button[value=talked]');
  await p.waitForSelector('p.notice:has-text("logged")');
  if ((await name()) !== 'Vic Due') fail(`due call should come next, got ${await name()}`);
  if (!(await p.textContent('.next-up')).includes('1 done today')) fail('done count should go up');
  // Skip moves Vic to the back
  await p.click('text=Skip for now');
  await p.waitForFunction(() => document.querySelector('#up-name')?.textContent === 'Wes New');
  await p.fill('input[name=notes]', 'Rang twice');
  await p.click('button[value=no_answer]');
  await p.waitForSelector('p.notice:has-text("logged")');
  if (psql("SELECT a.notes FROM activities a JOIN leads l ON l.id = a.lead_id WHERE l.name = 'Wes New'") !== 'Rang twice') fail('notes not saved');
  if ((await name()) !== 'Vic Due') fail(`skipped prospect should come back, got ${await name()}`);
  // Booking a meeting from the card
  await p.click('summary:has-text("Booked a meeting")');
  await p.fill('input[name=time]', '14:30');
  await p.click('button:has-text("Save meeting")');
  await p.waitForSelector('p.notice:has-text("booked")');
  if (psql("SELECT l.status || ' ' || (SELECT count(*) FROM meetings m WHERE m.lead_id = l.id) || ' ' || (SELECT outcome FROM activities a WHERE a.lead_id = l.id) FROM leads l WHERE l.name = 'Vic Due'") !== 'talking 1 meeting_booked') fail('meeting should be booked and logged');
  if (!(await p.locator('.meetings-today').count())) fail('today\'s meeting should show at the top');
  if (!(await p.locator('text=You are done for now').count())) fail('queue should be empty');
  const goalsNow = await p.textContent('.goals');
  if (!goalsNow.includes('Calls: 3 of 3') || !goalsNow.includes('1 day')) fail(`goal met and streak expected, got ${goalsNow}`);
  await p.screenshot({ path: S + '/33-next-up-done.png', fullPage: true });

  // A new customer: Next up asks for referrals, and the names become prospects
  psql(`INSERT INTO leads (client_id, name, phone, received_on, status, customer_since, closed_on, won_by)
        VALUES (${id}, 'Yara Won', '248-555-0199', ${D} - 20, 'won', ${D} - 2, ${D} - 2, (SELECT id FROM users WHERE email = 'owner@example.test'))`);
  await p.goto(base + '/next');
  if ((await name()) !== 'Yara Won' || !(await p.locator('.pill:has-text("Ask for referrals")').count())) fail('referral ask should come up');
  await p.screenshot({ path: S + '/34-referral-ask.png', fullPage: true });
  await p.fill('input[name=name1]', 'Zed Friend');
  await p.fill('input[name=phone1]', '248-555-0177');
  await p.click('button:has-text("Save referrals")');
  await p.waitForSelector('p.notice:has-text("referral")');
  if (psql("SELECT source || ' ' || notes FROM leads WHERE name = 'Zed Friend'") !== 'Referral Referred by Yara Won') fail('referral should be a new prospect');
  if (psql("SELECT referral_asked FROM leads WHERE name = 'Yara Won'") !== 't') fail('ask should be marked done');
  if ((await name()) !== 'Zed Friend') fail(`the referral should be up next, got ${await name()}`);

  await browser.close();
  console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
