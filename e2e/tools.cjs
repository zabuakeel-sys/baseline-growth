// Rep tools: personal page + QR, instant quote, brief, visit route, partner referral form,
// referral asks, insights, daily goals, and the call assistant (consent, script fallback, AI path).
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const S = process.argv[2] || require('node:os').tmpdir();
const base = 'http://localhost:3100';
const psql = (sql) => execSync(`psql -h /var/tmp/bgpg -p 5433 -U app -d bg -tAc "${sql}"`).toString().trim();
(async () => {
  const browser = await chromium.launch();
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
  const o = await ctx.newPage();
  await o.goto(base + '/login');
  await o.fill('input[name=email]', 'owner@example.test');
  await o.fill('input[name=password]', 'testpassword123');
  await o.click('button[type=submit]');
  await o.waitForURL((u) => !u.pathname.startsWith('/login'));
  const ownerId = Number(psql("SELECT id FROM users WHERE email = 'owner@example.test'"));

  // Client setup: claim link, pricing, script with objection answers
  await o.goto(base + '/clients');
  await o.click('.biz-card:has-text("LibraPro Facility Services")');
  await o.waitForURL(/\/clients\/\d+$/);
  const clientUrl = o.url().split('#')[0].split('?')[0];
  const clientId = Number(clientUrl.split('/').pop());
  await o.goto(clientUrl + '/settings');
  await o.waitForSelector('#tools-h');
  await o.fill('input[name=claim_url]', 'https://libra.example/book?src=outreach');
  await o.fill('input[name=claim_label]', 'Book your free walkthrough');
  await o.fill('textarea[name=pricing_lines]', 'Office: 45\nMedical: 60');
  await o.fill('input[name=pricing_minimum]', '400');
  await o.click('text=Save rep tools');
  await o.waitForSelector('p.notice:has-text("Rep tools saved")');
  await o.fill('input[name=offer]', 'LibraPro cleans offices and medical buildings in Michigan and Ohio.');
  await o.click('text=Save client');
  await o.waitForSelector('p.notice:has-text("Client saved")');
  await o.fill('textarea[name=call_script]', 'Opening: Hi, this is calling for LibraPro.\nIf they say "we already have someone": Most of our customers did too. What would you change about them?\nIf price comes up: We quote after a free walkthrough, so you compare real numbers.');
  await o.click('text=Save script');
  await o.waitForSelector('p.notice:has-text("Script saved")');

  // Prospects with listing signals and addresses (as the finder would add them)
  psql(`INSERT INTO leads (client_id, name, phone, email, source, notes, received_on, assignee_id, address, rating, reviews) VALUES
    (${clientId}, 'Tower Dental', '(248) 555-0101', '', 'Research', 'Family dental practice since 1998', CURRENT_DATE, ${ownerId}, '10 Main St, Troy, MI 48084, USA', 4.8, 31),
    (${clientId}, 'Maple Offices', '(248) 555-0102', '', 'Research', '', CURRENT_DATE, ${ownerId}, '20 Elm St, Troy, MI 48084, USA', 4.1, 12)`);
  const tower = Number(psql("SELECT id FROM leads WHERE name = 'Tower Dental'"));

  // 3. Brief on the prospect card
  await o.goto(base + '/clients/' + clientId + '/prospects');
  await o.waitForSelector('#leads-h');
  const card = o.locator('article.lead', { hasText: 'Tower Dental' });
  const briefText = await card.locator('ul.brief').textContent();
  console.log('brief:', briefText);
  if (!briefText.includes('Family dental practice') || !briefText.includes('well liked but not widely known')) fail('brief wrong');

  // 2. Instant quote saved to the prospect
  await card.locator('summary:has-text("Instant quote")').click();
  await card.locator('select[name=type]').selectOption('Medical');
  await card.locator('input[name=sqft]').fill('10000');
  await card.locator('select[name=visits]').selectOption('3');
  const range = await card.locator('.quote-result').textContent();
  console.log('quote:', range); // 60 * 10 * 3 * 4.333 = $7,800 -> $7,020 to $8,580
  if (!range.includes('$7,020 to $8,580')) fail('quote range wrong');
  await card.locator('button:has-text("Save quote to prospect")').click();
  await o.waitForSelector('p.notice:has-text("Quote saved")');
  if (!psql(`SELECT notes FROM leads WHERE id = ${tower}`).includes('quoted $7,020 to $8,580 a month (Medical, 10,000 sq ft, 3x a week)')) fail('quote not in notes');

  // 1. Personal page with QR code and tagged link
  await o.goto(base + '/preview/' + tower);
  const btn = await o.locator('a.button.big').getAttribute('href');
  console.log('claim link:', btn);
  if (btn !== `https://libra.example/book?src=outreach&ref=bg-${tower}`) fail('claim link not tagged');
  if (!(await o.locator('.qr svg').count())) fail('no QR code');
  const ph = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await ctx.storageState() })).newPage();
  await ph.goto(base + '/preview/' + tower);
  await ph.screenshot({ path: S + '/23-preview-phone.png', fullPage: true });

  // 5. Partner with a public referral form
  await o.goto(base + '/partners');
  await o.fill('input[name=name]', 'Metro Property Group');
  await o.fill('input[name=kind]', 'Property manager');
  await o.selectOption('select[name=client_id]', { label: 'LibraPro Facility Services' });
  await o.fill('input[name=fee]', '150');
  await o.click('text=Add partner');
  await o.waitForSelector('p.notice:has-text("Partner added")');
  const link = await o.locator('td code').first().textContent();
  console.log('partner link:', link);
  const pub = await browser.newPage(); // no login
  await pub.goto(link.replace(/^https?:\/\/[^/]+/, base));
  await pub.fill('input[name=name]', 'Lakeside Medical Center');
  await pub.fill('input[name=contact]', 'Joan, office manager');
  await pub.fill('input[name=phone]', '(248) 555-0199');
  await pub.click('text=Send referral');
  await pub.waitForSelector('p.notice:has-text("Thank you")');
  // Bots filling the hidden field are silently ignored
  await pub.fill('input[name=name]', 'Spam Bot LLC');
  await pub.fill('input[name=phone]', '1');
  await pub.evaluate(() => { document.querySelector('input[name=website]').value = 'http://spam'; });
  await pub.click('text=Send referral');
  await pub.waitForSelector('p.notice');
  const referred = psql("SELECT name || '|' || next_action FROM leads WHERE source = 'Referral' ORDER BY id");
  console.log('referred:', referred);
  if (!referred.includes('Lakeside Medical Center|Referral from Metro Property Group: call today')) fail('partner referral not created');
  if (referred.includes('Spam Bot')) fail('honeypot let a bot through');
  await o.goto(base + '/next');
  await o.waitForSelector('.biz-day');
  if (!(await o.locator('.lead-row:has-text("Lakeside Medical Center")').count())) fail('referral should be a due call on Today');

  // 6. Referral ask after a customer signs: open the lead, sign it, then the new customer shows a referral ask
  await o.locator('.lead-row', { hasText: 'Lakeside Medical Center' }).click();
  await o.waitForSelector('.research');
  await o.click('button[value=signed]');
  await o.waitForSelector('.biz-day');
  await o.locator('.lead-row', { hasText: 'Lakeside Medical Center' }).click();
  await o.waitForSelector('.r-tag:has-text("Ask for referrals")');
  await o.fill('input[name=name1]', 'Northside Clinic');
  await o.fill('input[name=phone1]', '(248) 555-0300');
  await o.click('button:has-text("Save referrals")');
  await o.waitForSelector('p.notice:has-text("referral")');
  if (psql("SELECT referred_by IS NOT NULL FROM leads WHERE name = 'Northside Clinic'") !== 't') fail('referral not linked to customer');
  await o.goto(base + '/partners');
  const prow = (await o.locator('tr', { hasText: 'Metro Property Group' }).locator('td').allTextContents()).map((t) => t.trim());
  console.log('partner row:', prow.slice(2, 5).join(' | '));
  if (prow[2] !== '1' || prow[3] !== '1' || !prow[4].startsWith('$150')) fail('partner stats wrong');

  // 7. Insights
  psql(`INSERT INTO leads (client_id, name, phone, received_on, status, lost_reason) SELECT ${clientId}, 'Lost ' || g, '1', CURRENT_DATE, 'lost', CASE WHEN g % 3 = 0 THEN 'Timing' ELSE 'Price' END FROM generate_series(1, 6) g`);
  await o.goto(base + '/insights');
  const ins = await o.textContent(`section:has(a:has-text("LibraPro Facility Services"))`);
  if (!ins.includes('Price: 4 (67%)') || !ins.includes('Timing: 2 (33%)')) fail('loss reasons wrong: ' + ins.replace(/\s+/g, ' ').slice(0, 300));

  // Call assistant: consent gate, script fallback (no AI key in this run)
  await o.goto(base + '/call/' + tower);
  if (await o.locator('text=Start listening').count()) fail('listener available before consent');
  await o.locator('.call input[type=checkbox]').click();
  await o.fill('input[placeholder="We already have a cleaner"]', 'Honestly we already have someone for that');
  await o.click('text=Add and suggest');
  await o.waitForFunction(() => document.querySelector('.suggestion .say')?.textContent.includes('Most of our customers did too'));
  console.log('script suggestion:', await o.textContent('.suggestion'));
  await o.locator('input[name=outcome][value=talked]').check({ force: true });
  await o.click('text=Save call');
  await o.waitForSelector('p.notice:has-text("Call logged")');
  if (!psql(`SELECT notes FROM activities WHERE lead_id = ${tower} ORDER BY id DESC LIMIT 1`).includes('already have someone')) fail('call notes not saved');
  await o.screenshot({ path: S + '/24-call.png', fullPage: true });

  console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
  await browser.close();
})();
