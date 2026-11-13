const { chromium } = require('playwright');
const S = process.argv[2] || require('node:os').tmpdir(); // where screenshots go
const base = 'http://localhost:3100';
(async () => {
  const browser = await chromium.launch();
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const login = async (page, email, pw) => {
    await page.goto(base + '/login');
    await page.fill('input[name=email]', email);
    await page.fill('input[name=password]', pw);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => !u.pathname.startsWith('/login')); await page.goto(base + '/clients');
  };
  // Anonymous visitors are sent to login
  const anon = await browser.newPage();
  await anon.goto(base + '/money');
  if (!anon.url().endsWith('/login')) fail('anonymous reached money');
  // Wrong password refused, email kept
  await p.goto(base + '/login');
  await p.fill('input[name=email]', 'owner@example.test');
  await p.fill('input[name=password]', 'wrong-password');
  await p.click('button[type=submit]');
  await p.waitForSelector('p.error');
  if ((await p.inputValue('input[name=email]')) !== 'owner@example.test') fail('email cleared after bad login');
  await login(p, 'owner@example.test', 'testpassword123');

  // LibraPro deal: 10% for 36 months, plus offer and address
  await p.click('table >> text=LibraPro Facility Services');
  await p.waitForSelector('#leads-h');
  const clientUrl = p.url().split('#')[0].split('?')[0];
  await p.selectOption('select[name=status]', 'active');
  await p.fill('input[name=share_percent]', '10');
  await p.fill('input[name=share_months]', '36');
  await p.fill('input[name=contract_start]', '2026-09-01');
  await p.fill('input[name=offer]', 'LibraPro handles commercial cleaning for offices and buildings in Michigan and Ohio.');
  await p.fill('input[name=mailing_address]', '100 Example Ave, Detroit, MI 48201');
  await p.click('text=Save client');
  await p.waitForSelector('p.notice');
  const sub = await p.textContent('p.sub');
  if (!sub.includes('10% of what each customer we bring pays for 36 months')) fail('terms line wrong: ' + sub);

  // Prospects
  const add = async (name, email, need) => {
    if (!(await p.locator('input[name=need]').isVisible())) await p.click('summary:has-text("Add one by hand")');
    await p.fill('input[name=name]', name);
    await p.fill('input[name=email]', email);
    await p.fill('input[name=need]', need);
    await p.click('text=Add prospect');
  };
  await add('Dana Smith', 'dana@tower.example', 'Nightly cleaning for a 20,000 sq ft office');
  await p.waitForSelector('article.lead:has-text("Dana Smith")');
  await add('Dana Again', 'DANA@tower.example', '');
  await p.waitForSelector('p.error');
  console.log('duplicate:', await p.textContent('p.error'));
  await p.reload();
  await add('Pat Lee', 'pat@plaza.example', 'Common area cleaning');
  await p.waitForSelector('article.lead:has-text("Pat Lee")');
  await add('Sam Cole', 'sam@nope.example', '');
  await p.waitForSelector('article.lead:has-text("Sam Cole")');

  const dana = () => p.locator('article.lead', { hasText: 'Dana Smith' });
  const msg = await dana().locator('pre.message').textContent();
  for (const want of ['Hi Dana,', 'on behalf of LibraPro Facility Services', 'commercial cleaning for offices', 'help with nightly cleaning', 'reply "no thanks"', '100 Example Ave, Detroit, MI 48201']) {
    if (!msg.includes(want)) fail('first message missing: ' + want);
  }
  await p.screenshot({ path: S + '/14-prospects.png', fullPage: true });

  // Dana: sent, replied, introduced, became a customer in September
  await dana().locator('text=I sent it').click();
  await p.waitForFunction(() => [...document.querySelectorAll('article.lead')].find((a) => a.textContent.includes('Dana Smith'))?.textContent.includes('Follow-up 1 of 3'));
  await dana().locator('text=They replied').click();
  await p.waitForFunction(() => [...document.querySelectorAll('article.lead')].find((a) => a.textContent.includes('Dana Smith'))?.textContent.includes('Talking'));
  await dana().locator('summary:has-text("Introduced to client")').click();
  await dana().locator('text=Save introduction').click();
  await p.waitForSelector('p.notice:has-text("Introduced")');
  await dana().locator('summary:has-text("Became a customer")').click();
  await dana().locator('input[name=customer_since]').fill('2026-09-12');
  await dana().locator('text=Record customer').click();
  await p.waitForSelector('p.notice:has-text("New customer")');

  // Sam opts out; cannot be added again, even for another client
  await p.locator('article.lead', { hasText: 'Sam Cole' }).locator('text=Asked not to be contacted').click();
  await p.waitForSelector('p.notice:has-text("do not contact")');

  // Customer revenue: Sep confirmed $4,000, Oct $4,000 not confirmed
  const cust = () => p.locator('section[aria-labelledby=customers-h] article.lead', { hasText: 'Dana Smith' });
  const enter = async (month, amount, confirm) => {
    await cust().locator('summary:has-text("Enter a month")').click();
    await cust().locator('input[name=month]').fill(month);
    await cust().locator('input[name=revenue]').fill(amount);
    if (confirm) { await cust().locator('input[name=confirmed]').check(); await cust().locator('input[name=confirmed_by]').fill('LibraPro office'); }
    await cust().locator('button:has-text("Save")').click();
    const label = new Date(month + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    await p.waitForFunction((l) => document.querySelector('section[aria-labelledby=customers-h] table')?.textContent.includes(l), label);
  };
  await enter('2026-09', '4000', true);
  await enter('2026-10', '4000', false);
  // Month before they became a customer is refused
  await cust().locator('summary:has-text("Enter a month")').click();
  await cust().locator('input[name=month]').fill('2026-08');
  await cust().locator('input[name=revenue]').fill('9999');
  await cust().locator('button:has-text("Save")').click();
  await cust().locator('p.error').waitFor();
  console.log('before start:', await cust().locator('p.error').textContent());

  const owe = (await p.textContent('section[aria-labelledby=money-h] table')).replace(/\s+/g, ' ');
  console.log('statement:', owe);
  if (!owe.includes('Sep 2026$400')) fail('September share should be $400');
  if (!owe.includes('+$400 waiting')) fail('October share should be waiting');
  await p.screenshot({ path: S + '/15-client.png', fullPage: true });

  await p.goto(base + '/money');
  const stats = (await p.textContent('.stats')).replace(/\s+/g, ' ');
  console.log('money:', stats);
  if (!stats.includes('Late$400')) fail('September $400 should be late');
  await p.screenshot({ path: S + '/16-money.png', fullPage: true });

  // Opted-out person cannot be added to AutoAt either
  await p.goto(base + '/leads');
  await p.click('summary:has-text("Add a prospect")');
  await p.selectOption('select[name=client_id]', { label: 'AutoAt' });
  await p.fill('input[name=name]', 'Sam Cole');
  await p.fill('input[name=email]', 'sam@nope.example');
  await p.click('text=Add prospect');
  await p.waitForSelector('p.error');
  console.log('opted out:', await p.textContent('p.error'));

  // Dashboard counts
  await p.goto(base + '/clients');
  const dash = (await p.textContent('table')).replace(/\s+/g, ' ');
  console.log('businesses:', dash);
  const cells = await p.locator('tr', { hasText: 'LibraPro Facility Services' }).locator('td.num').allTextContents();
  if (cells[0] !== '1' || cells[2] !== '1') fail(`business counts wrong: ${cells}`);

  // Team member: no money anywhere, cannot change a confirmed amount
  await p.goto(base + '/team');
  await p.fill('input[name=name]', 'Test Rep');
  await p.fill('input[name=email]', 'rep@example.test');
  await p.fill('input[name=password]', 'reppassword1');
  await p.click('text=Add team member');
  await p.waitForSelector('p.notice');
  const r = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await login(r, 'rep@example.test', 'reppassword1');
  await r.goto(base + '/money');
  if (r.url().includes('/money')) fail('team member reached money');
  await r.goto(clientUrl);
  const body = await r.textContent('main');
  if (body.includes('Our share') || body.includes('What they owe us') || body.includes('10% of')) fail('team member sees money');
  const rc = r.locator('section[aria-labelledby=customers-h] article.lead', { hasText: 'Dana Smith' });
  await rc.locator('summary:has-text("Enter a month")').click();
  await rc.locator('input[name=month]').fill('2026-09');
  await rc.locator('input[name=revenue]').fill('1');
  await rc.locator('button:has-text("Save")').click();
  await rc.locator('p.error').waitFor();
  console.log('rep edits confirmed:', await rc.locator('p.error').textContent());
  await r.goto(base + '/leads');
  if (await r.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) fail('prospects page scrolls sideways on a phone');
  await r.screenshot({ path: S + '/17-prospects-phone.png', fullPage: true });

  console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
  await browser.close();
})();
