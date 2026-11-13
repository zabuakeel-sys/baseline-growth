const { chromium } = require('playwright');
const S = process.argv[2] || require('node:os').tmpdir(); // where screenshots go
const base = 'http://localhost:3100';
(async () => {
  const browser = await chromium.launch();
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  const p = await (await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await p.goto(base + '/login');
  await p.fill('input[name=email]', 'owner@example.test');
  await p.fill('input[name=password]', 'testpassword123');
  await p.click('button[type=submit]');
  await p.waitForURL(base + '/today'); await p.goto(base + '/');
  await p.goto(base + '/find');
  if (await p.locator('text=Business search is not connected yet').count()) fail('should show as connected');
  await p.selectOption('select[name=client_id]', { label: 'AutoAt' });
  await p.fill('input[name=what]', 'independent auto repair shop');
  await p.fill('input[name=location]', 'Detroit, MI');
  await p.fill('input[name=exclude]', 'Midas, Jiffy Lube');
  await p.click('text=Save search');
  await p.waitForSelector('p.notice');
  await p.click('text=Run search');
  await p.waitForSelector('p.notice:has-text("Found")', { timeout: 60000 });
  console.log('run:', await p.textContent('p.notice'));
  const items = await p.locator('ul.candidates li').allTextContents();
  console.log('queue:', items.map((t) => t.replace(/\s+/g, ' ').trim().slice(0, 110)));
  if (items.length !== 2) fail('expected 2 (Midas excluded, closed and unreachable businesses dropped)');
  if (!items[0].includes("Al Dean's Auto Repair") || !items[0].includes('info@aldeansauto.example')) fail('Dean should be first with the email from its contact page');
  if (!items[0].includes('Family-owned auto repair')) fail('about line missing');
  const checked = await p.locator('ul.candidates input[type=checkbox]:checked').count();
  console.log('pre-ticked:', checked);
  await p.screenshot({ path: S + '/18-find.png', fullPage: true });

  await p.click('text=Add ticked to prospects');
  await p.waitForSelector('p.notice:has-text("added to prospects")');
  console.log('add:', await p.textContent('p.notice'));

  // Run again: nothing new
  await p.click('text=Run search');
  await p.waitForSelector('p.notice:has-text("0 new")', { timeout: 60000 });

  // Prospect has the email, the right client, and its first message is ready
  await p.goto(base + '/leads');
  const dean = p.locator('article.lead', { hasText: "Al Dean's Auto Repair" });
  if (!(await dean.count())) fail('Dean not in prospects');
  else if (!(await dean.textContent()).includes('info@aldeansauto.example')) fail('prospect email missing');
  console.log('prospects due:', await p.locator('section[aria-labelledby=due-h] article.lead').count());

  // Skip the rest
  await p.goto(base + '/find');
  const left = await p.locator('ul.candidates li').count();
  if (left) {
    for (const box of await p.locator('ul.candidates input[type=checkbox]').all()) await box.check();
    await p.click('text=Skip ticked');
    await p.waitForSelector('p.notice:has-text("skipped")');
  }
  if (await p.locator('ul.candidates li').count()) fail('queue should be empty');

  const ph = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await p.context().storageState() })).newPage();
  await ph.goto(base + '/find');
  if (await ph.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) fail('find page scrolls sideways on phone');
  console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
  await browser.close();
})();
