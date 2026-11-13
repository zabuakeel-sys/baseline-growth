// Adding a business from its website: the site is read, AI drafts the answers, the owner fills
// only what a website cannot say, and the deal terms become the standard for the next business.
// Needs: e2e/mock-claude.cjs on :3300; app with ANTHROPIC_API_KEY=test-key,
// ANTHROPIC_BASE_URL=http://localhost:3300, ALLOW_PRIVATE_FETCH=1, OUTREACH_BACKGROUND=off.
const http = require('http');
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const S = process.argv[2] || require('node:os').tmpdir();
const base = 'http://localhost:3100';
const psql = (sql) => execSync(`psql -h /var/tmp/bgpg -p 5433 -U app -d bg -tAc "${sql.replace(/"/g, '\\"')}"`).toString().trim();

const PAGES = {
  '/': `<html><head><title>Shine Cleaning | Office Cleaning in Troy</title><meta name="description" content="Nightly office cleaning.">
    <meta property="og:image" content="https://shine.example/og.png"></head><body><img src="https://shine.example/shine-logo.png" alt="Shine logo">
    <a href="tel:248-555-0142">248-555-0142</a><a href="/about">About</a><a href="/services">Services</a>
    <a href="https://calendly.com/shine/walkthrough">Book a free walkthrough</a><h1>Nightly office and medical cleaning</h1></body></html>`,
  '/about': '<html><body><h1>About</h1><p>Same crew every night. Insured and bonded. Serving Troy and Southfield.</p></body></html>',
  '/services': '<html><body><h1>Services</h1><p>Dental offices, medical clinics.</p></body></html>',
};
const site = http.createServer((req, res) => {
  const page = PAGES[req.url.split('?')[0]];
  res.writeHead(page ? 200 : 404, { 'Content-Type': 'text/html' });
  res.end(page ?? 'not found');
}).listen(3400);

(async () => {
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  const browser = await chromium.launch();
  const p = await (await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await p.goto(base + '/login');
  await p.fill('input[name=email]', 'owner@example.test');
  await p.fill('input[name=password]', 'testpassword123');
  await p.click('button[type=submit]');
  await p.waitForURL(base + '/');

  await p.goto(base + '/clients/new');
  await p.fill('input[name=website]', 'http://127.0.0.1:3400/');
  await p.click('button:has-text("Read their website")');
  await p.waitForSelector('p.notice:has-text("Read http://127.0.0.1:3400/")', { timeout: 60_000 });
  const v = (n) => p.inputValue(`[name=${n}]`);
  if ((await v('name')) !== 'Shine Cleaning') fail(`name: ${await v('name')}`);
  if (!(await v('offer')).startsWith('Shine Cleaning does nightly office')) fail('offer not drafted');
  if ((await v('who')) !== 'dental office\nmedical clinic' || (await v('where')) !== 'Troy, MI\nSouthfield, MI') fail('customer types or places not drafted');
  if ((await v('claim_url')) !== 'https://calendly.com/shine/walkthrough') fail(`booking link: ${await v('claim_url')}`);
  if ((await v('logo_url')) !== 'https://shine.example/shine-logo.png') fail(`logo: ${await v('logo_url')}`);
  if ((await v('contact_phone')) !== '248-555-0142') fail('phone not read');
  if ((await v('objection1')) !== 'We already have a cleaner') fail('objection not drafted');
  const fromSite = await p.locator('.pill.from-site').count();
  const askOwner = await p.locator('.pill.ask-owner').count();
  console.log(`from website: ${fromSite}, ask the owner: ${askOwner}`);
  if (fromSite < 14) fail('drafted answers should be marked to check');
  if (askOwner > 7) fail('only the answers a website cannot give should be left to ask');
  const sent = JSON.parse(require('fs').readFileSync('/var/tmp/claude-requests.json', 'utf8')).find((r) => String(r.body.system).includes('set up a new client'));
  if (!sent || !sent.body.messages[0].content.includes('Same crew every night')) fail('AI should get the about page text too');
  await p.screenshot({ path: S + '/35-signup-drafted.png', fullPage: true });

  if ((await v('contact_name')) !== 'Sam Shine' || (await v('contact_email')) !== 'sam@shine.example') fail('contact not drafted from the site');
  if ((await v('mailing_address')) !== '1 Shine Way, Troy, MI 48084') fail('address not drafted');
  if ((await v('pricing')) !== 'Office: 45' || (await v('visits')) !== 'yes') fail('pricing or visits not drafted');
  const owner = (await p.locator('.pill.ask-owner').allTextContents()).join('|');
  console.log('still asked:', owner);
  // Only what a website cannot say is left
  await p.fill('[name=customer_value]', '1200');
  await p.fill('[name=share_percent]', '12');
  await p.fill('[name=share_months]', '24');
  await p.click('button:has-text("Set up this business")');
  await p.waitForSelector('p.notice:has-text("is set up with 4 searches")');
  const c = psql("SELECT offer || '|' || claim_url || '|' || logo_url || '|' || share_percent FROM clients WHERE name = 'Shine Cleaning'");
  if (c !== 'Shine Cleaning does nightly office and medical cleaning across Oakland County.|https://calendly.com/shine/walkthrough|https://shine.example/shine-logo.png|12.00') fail(`saved wrong: ${c}`);

  // The terms are now the standard for the next business
  await p.goto(base + '/clients/new?manual=1');
  if ((await v('share_percent')) !== '12' || (await v('share_months')) !== '24') fail('standard terms should be pre-filled');

  // A site that cannot be opened
  await p.goto(base + '/clients/new');
  await p.fill('input[name=website]', 'http://127.0.0.1:3999/');
  await p.click('button:has-text("Read their website")');
  await p.waitForSelector('p.error:has-text("Could not open that website")');

  await browser.close();
  site.close();
  console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
})().catch((e) => { console.error(e); site.close(); process.exit(1); });
