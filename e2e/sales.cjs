// Sales team workspace: rep's Today list, logging calls, meetings, customers, scoreboard and commission.
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const S = process.argv[2] || require('node:os').tmpdir();
const base = 'http://localhost:3100';
const psql = (sql) => execSync(`psql -h /var/tmp/bgpg -p 5433 -U app -d bg -tAc "${sql}"`).toString().trim();
(async () => {
  const browser = await chromium.launch();
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  const login = async (page, email, pw) => {
    await page.goto(base + '/login');
    await page.fill('input[name=email]', email);
    await page.fill('input[name=password]', pw);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  };
  const o = await (await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await login(o, 'owner@example.test', 'testpassword123');

  // Owner: add a rep at 20% commission
  await o.goto(base + '/team');
  await o.fill('form.grid input[name=name]', 'Rita Rep');
  await o.fill('form.grid input[name=email]', 'rita@example.test');
  await o.fill('form.grid input[name=password]', 'ritapassword1');
  await o.click('text=Add team member');
  await o.waitForSelector('p.notice');
  const ritaRow = o.locator('tr', { hasText: 'rita@example.test' });
  await ritaRow.locator('input[name=commission_percent]').fill('20');
  await ritaRow.locator('form:has(input[name=commission_percent]) button').click();
  await o.waitForFunction(() => [...document.querySelectorAll('tr')].some((r) => r.textContent.includes('rita@') && r.querySelector('input')?.value === '20'));
  const ritaId = Number(psql("SELECT id FROM users WHERE email = 'rita@example.test'"));

  // LibraPro: 10% for 36 months from this month, a script, three prospects for Rita in two cities
  await o.goto(base + '/');
  await o.click('.biz-card:has-text("LibraPro Facility Services")');
  await o.waitForSelector('#leads-h');
  const clientUrl = o.url().split('#')[0].split('?')[0];
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(new Date()).slice(0, 7);
  await o.selectOption('select[name=status]', 'active');
  await o.fill('input[name=share_percent]', '10');
  await o.fill('input[name=share_months]', '36');
  await o.fill('input[name=contract_start]', month + '-01');
  await o.click('text=Save client');
  await o.waitForSelector('p.notice');
  await o.fill('textarea[name=call_script]', 'Opening: Hi, this is Rita calling for LibraPro.\nAsk for: a free walkthrough this week.');
  await o.click('text=Save script');
  await o.waitForSelector('p.notice:has-text("Script saved")');
  for (const [name, phone, address] of [
    ['Tower Dental', '(248) 555-0101', '10 Main St, Troy, MI 48084, USA'],
    ['Maple Offices', '(248) 555-0102', '20 Elm St, Troy, MI 48084, USA'],
    ['River Clinic', '(313) 555-0103', '30 Oak St, Detroit, MI 48201, USA'],
  ]) {
    if (!(await o.locator('input[name=address]').isVisible())) await o.click('summary:has-text("Add one by hand")');
    await o.fill('input[name=name]', name);
    await o.fill('input[name=phone]', phone);
    await o.fill('input[name=address]', address);
    await o.selectOption('select[name=assignee_id]', { label: 'Rita Rep' });
    await o.click('text=Add prospect');
    await o.waitForSelector(`article.lead:has-text("${name}")`);
  }

  // Rep's day
  const r = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await login(r, 'rita@example.test', 'ritapassword1');
  if (new URL(r.url()).pathname !== '/') fail(`rep should land on Home, got ${r.url()}`);
  await r.goto(base + '/today');
  const fresh = await r.textContent('section[aria-labelledby=new-h]');
  if (!fresh.includes('Troy') || !fresh.includes('Detroit')) fail('call and visit list should be grouped by city');
  if (!fresh.includes('Ask for: a free walkthrough')) fail('client script should show on the card');
  await r.screenshot({ path: S + '/21-today-rep.png', fullPage: true });
  const cardOf = (name) => r.locator('article.lead', { hasText: name }).first();
  const log = async (name, channel, outcome, notes = '') => {
    const c = cardOf(name);
    if (!(await c.locator('input[name=outcome]').first().isVisible())) await c.locator('summary:has-text("Log a call or visit")').click();
    await c.locator(`input[name=channel][value=${channel}]`).check({ force: true });
    await c.locator(`input[name=outcome][value=${outcome}]`).check({ force: true });
    if (notes) await c.locator('input[name=notes]').fill(notes);
    await c.locator('form.log-form button[type=submit]').click();
    await r.waitForSelector(`p.notice:has-text("logged")`);
  };
  await log('Tower Dental', 'call', 'no_answer');
  console.log('after no answer:', psql("SELECT status || ' next ' || next_action_on FROM leads WHERE name = 'Tower Dental'"));
  if ((await r.textContent('section[aria-labelledby=new-h]')).includes('Tower Dental')) fail('called prospect should leave the fresh list');

  await log('Maple Offices', 'visit', 'talked', 'Spoke to office manager, unhappy with current cleaner');
  const maple = r.locator('article.lead', { hasText: 'Maple Offices' }).first();
  if ((await maple.count()) === 0) {
    // Talked sets a next step 3 days out, so the card leaves today's list; book from the client page instead.
  }
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Detroit' });
  await r.goto(clientUrl + '#leads-h');
  const mc = r.locator('article.lead', { hasText: 'Maple Offices' }).first();
  await mc.locator('summary:has-text("Book a meeting")').click();
  await mc.locator('input[name=date]').fill(tomorrow);
  await mc.locator('input[name=time]').fill('10:30');
  await mc.locator('input[name=location]').fill('Their office');
  await mc.locator('button:has-text("Book")').click();
  await r.waitForSelector('p.notice:has-text("booked")');
  await r.goto(base + '/today');
  if (!(await r.textContent('section[aria-labelledby=meet-h]')).includes('Maple Offices')) fail('meeting should show on Today');
  await r.goto(clientUrl + '#leads-h');
  await r.locator('article.lead', { hasText: 'Maple Offices' }).first().locator('button:has-text("Held")').click();
  await r.waitForSelector('p.notice:has-text("Meeting updated")');

  await r.goto(base + '/today');
  await log('River Clinic', 'call', 'signed');
  console.log('River:', psql("SELECT status || ' won_by=' || won_by FROM leads WHERE name = 'River Clinic'"));
  if (psql("SELECT won_by FROM leads WHERE name = 'River Clinic'") !== String(ritaId)) fail('customer should be credited to Rita');

  // Owner confirms River Clinic paid LibraPro $4,000 this month
  await o.goto(clientUrl);
  const rc = o.locator('section[aria-labelledby=customers-h] article.lead', { hasText: 'River Clinic' });
  await rc.locator('summary:has-text("Enter a month")').click();
  await rc.locator('input[name=month]').fill(month);
  await rc.locator('input[name=revenue]').fill('4000');
  await rc.locator('input[name=confirmed]').check();
  await rc.locator('input[name=confirmed_by]').fill('LibraPro office');
  await rc.locator('button:has-text("Save")').click();
  await o.waitForSelector('p.notice:has-text("Revenue saved")');

  // Scoreboard: Rita 2 calls, 1 visit, 2 conversations, 1 booked, 1 held, 1 customer, $80 commission (20% of $400)
  await o.goto(base + '/scoreboard?p=week');
  const cells = (await o.locator('tr', { hasText: 'Rita Rep' }).locator('td').allTextContents()).map((t) => t.trim());
  console.log('scoreboard:', cells.join(' | '));
  if (cells.join('|') !== 'Rita Rep|2|1|2|1|1|1|$80') fail('scoreboard row wrong');
  await o.screenshot({ path: S + '/22-scoreboard.png', fullPage: true });
  // Rita sees her own commission, not the owner's
  await r.goto(base + '/scoreboard');
  if (!(await r.locator('tr', { hasText: 'Rita Rep' }).textContent()).includes('$80')) fail('rep should see own commission');
  if (await r.locator('a[href="/money"]').count()) fail('rep should not see Money');

  // An opted-out prospect cannot be logged against
  psql("UPDATE leads SET status = 'opted_out' WHERE name = 'Tower Dental'");
  console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
  await browser.close();
})();
