const { chromium } = require('playwright');
const S = process.argv[2] || require('node:os').tmpdir(); // where screenshots go
const base = 'http://localhost:3100';
(async () => {
  const browser = await chromium.launch();
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(base + '/login');
  // old password no longer works after the reset
  await p.fill('input[name=email]', 'owner@example.test');
  await p.fill('input[name=password]', 'testpassword123');
  await p.click('button[type=submit]');
  await p.waitForURL(base + '/today'); await p.goto(base + '/');

  await p.click('table >> text=AutoAt');
  await p.waitForSelector('#checkups-h');
  const clientUrl = p.url();
  await p.click('text=Start checkup');
  await p.waitForSelector('fieldset.area');

  // Ratings: AutoAt-style example. Strong reach/price, weak getting found and repeat.
  const plan = { found: [2, 1, 2], convert: [4, 4, 3], reach: [4, 5, 4], repeat: [1, 2, 2], price: [4, 3, 4] };
  // Leave one blank first: browser should block, server would also refuse
  for (const [area, ratings] of Object.entries(plan)) {
    for (let i = 0; i < 3; i++) {
      if (area === 'price' && i === 2) continue;
      await p.check(`input[name=${area}_${i}][value="${ratings[i]}"]`, { force: true });
    }
  }
  await p.fill('textarea[name=notes_found]', 'Most drivers find us through word of mouth. No Google profile for AutoAt itself yet.');
  await p.fill('textarea[name=notes_repeat]', 'No reminder when an oil change is due.');
  await p.fill('textarea[name=summary]', 'Shops are signing up; drivers do not come back after the first booking.');
  await p.click('text=See results and plan');
  await p.waitForTimeout(800);
  if (!p.url().includes('/checkup')) fail('saved with a blank rating');
  await p.check('input[name=price_2][value="4"]', { force: true });
  await p.screenshot({ path: S + '/4-checkup-form.png', fullPage: false });
  await p.click('text=See results and plan');
  await p.waitForURL(/\/checkups\/\d+$/);
  const h = await p.textContent('#where-h');
  console.log('headline:', h);
  if (!/getting found and bringing customers back/.test(h)) fail('wrong focus: ' + h);
  const planText = await p.textContent('section[aria-labelledby=plan-h]');
  if (!planText.includes('Month 1') || !planText.includes('Google Business Profile')) fail('plan missing');
  await p.screenshot({ path: S + '/5-checkup-result.png', fullPage: true });

  await p.goto(clientUrl);
  const list = await p.textContent('section[aria-labelledby=checkups-h]');
  console.log('client list:', list.replace(/\s+/g, ' ').slice(0, 160));
  if (!list.includes('Weakest')) fail('checkup not listed on client');

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const m = await phone.newPage();
  await m.goto(base + '/login');
  await m.fill('input[name=email]', 'owner@example.test');
  await m.fill('input[name=password]', 'testpassword123');
  await m.click('button[type=submit]');
  await m.waitForURL(base + '/today'); await m.goto(base + '/');
  await m.goto(clientUrl + '/checkup');
  await m.check('input[name=found_0][value="3"]', { force: true });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) fail('checkup form scrolls sideways on a phone');
  await m.screenshot({ path: S + '/6-checkup-phone.png' });

  console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
  await browser.close();
})();
