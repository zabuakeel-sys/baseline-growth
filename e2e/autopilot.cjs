// From empty to reps working: add two reps, add a business by answering the questions, run
// autopilot, and check it searched, added prospects and split them between the reps.
// Needs e2e/mock-google.cjs on :3200, the app started with GOOGLE_PLACES_API_KEY=test-key
// PLACES_API_URL=http://localhost:3200/places ALLOW_PRIVATE_FETCH=1 OUTREACH_BACKGROUND=off, and a
// database with no businesses (reset without fixtures).
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

  // Empty system: the checklist says what to do first
  await o.goto(base + '/');
  const check = await o.textContent('section[aria-labelledby=todo-h]');
  if (!check.includes('Add your first business')) fail('Home should say to add the first business');
  if (check.includes('Connect business search')) fail('search is connected in this test');

  // Two reps
  for (const [name, email] of [['Rita Rep', 'rita@example.test'], ['Ben Rep', 'ben@example.test']]) {
    await o.goto(base + '/team');
    await o.fill('form.grid input[name=name]', name);
    await o.fill('form.grid input[name=email]', email);
    await o.fill('form.grid input[name=password]', 'reppassword1');
    await o.click('text=Add team member');
    await o.waitForSelector('p.notice');
  }

  // Add a business by answering the questions; a missing answer is caught first
  await o.goto(base + '/clients/new');
  const fill = async (k, v) => o.locator(`[name=${k}]`).fill(v);
  await fill('name', 'Shine Co');
  await o.click('text=Set up this business');
  await o.waitForSelector('p.error');
  console.log('missing:', await o.textContent('p.error'));
  await fill('contact_name', 'Sam Shine');
  await fill('contact_email', 'sam@shine.example');
  await fill('offer', 'We clean dental and medical offices across Metro Detroit');
  await fill('why_us', 'Same crew every night\nOne point of contact');
  await fill('first_step', 'Free walkthrough');
  await fill('claim_url', 'https://shine.example/book');
  await fill('who', 'dental office\nmedical clinic');
  await fill('where', 'Detroit, MI\nTroy, MI');
  await fill('skip', 'Aspen Dental');
  await fill('customer_value', '1500');
  await fill('objection1', 'We already have a cleaner');
  await fill('answer1', 'Most of our customers did too; what would you change about yours?');
  await fill('pricing', 'Office: 45\nMedical: 60');
  await fill('share_percent', '10');
  await fill('share_months', '36');
  await fill('contract_start', new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(new Date()));
  await fill('mailing_address', '100 Example Ave, Detroit, MI 48201');
  await o.click('text=Set up this business');
  await o.waitForSelector('p.notice:has-text("set up with 4 searches")');
  console.log('setup:', await o.textContent('p.notice'));
  const auto = await o.textContent('section[aria-labelledby=autopilot-h]');
  if (!auto.includes('On') || !auto.includes('4 searches')) fail('autopilot panel wrong');
  const script = await o.inputValue('textarea[name=call_script]');
  if (!script.includes('calling on behalf of Shine Co') || !script.includes('If they say "We already have a cleaner": Most of our customers did too')) fail('script not generated');
  await o.screenshot({ path: S + '/25-client-setup.png', fullPage: true });

  // Run autopilot: 4 searches, 4 businesses each, all good fits -> 16 prospects, 8 per rep
  await o.goto(base + '/outbox');
  const before = (await o.locator('p.notice').count()) ? await o.textContent('p.notice') : '';
  await o.click('text=Run now');
  await o.waitForFunction((b) => { const n = document.querySelector('p.notice'); return n && n.textContent !== b && n.textContent.includes('Run finished'); }, before, { timeout: 120000 });
  console.log('run:', await o.textContent('p.notice'));
  const split = psql("SELECT string_agg(u.name || '=' || n, ', ' ORDER BY u.name) FROM (SELECT assignee_id, count(*) n FROM leads GROUP BY assignee_id) x JOIN users u ON u.id = x.assignee_id");
  console.log('split:', split);
  if (split !== 'Ben Rep=8, Rita Rep=8') fail('prospects should be split 8 and 8');
  if (psql('SELECT count(*) FROM targets WHERE last_run_at IS NOT NULL') !== '4') fail('all 4 searches should have run');

  // Rita's Today: her 8, grouped by city, ready to call
  const r = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await login(r, 'rita@example.test', 'reppassword1');
  await r.goto(base + '/today');
  const fresh = await r.textContent('section[aria-labelledby=new-h]');
  const cards = await r.locator('section[aria-labelledby=new-h] article.lead').count();
  console.log('rita today cards:', cards);
  if (cards !== 8) fail('Rita should see 8 new prospects');
  if (!fresh.includes('Detroit') || !fresh.includes('Troy')) fail('grouped by city');
  await r.screenshot({ path: S + '/26-rep-today.png', fullPage: false });

  // Running again adds nothing: every search has run and the pile is untouched
  await o.goto(base + '/outbox');
  const b2 = (await o.locator('p.notice').count()) ? await o.textContent('p.notice') : '';
  await o.click('text=Run now');
  await o.waitForFunction((b) => { const n = document.querySelector('p.notice'); return n && n.textContent !== b && n.textContent.includes('Run finished'); }, b2, { timeout: 120000 });
  if (psql('SELECT count(*) FROM leads') !== '16') fail('second run should add nothing');

  // A new place adds searches; the daily search limit holds (1 left after setting it to 5: 4 used)
  await o.fill('input[name=max_searches_per_day]', '5');
  await o.click('text=Save settings');
  await o.waitForSelector('p.notice:has-text("Settings saved")');
  psql("UPDATE leads SET status = 'following_up', touches_sent = 1"); // reps worked them, so autopilot may add more
  const clientId = psql("SELECT id FROM clients WHERE name = 'Shine Co'");
  await o.goto(`${base}/clients/${clientId}/setup`);
  await o.locator('[name=where]').fill('Detroit, MI\nTroy, MI\nSouthfield, MI');
  await o.click('text=Save answers');
  await o.waitForSelector('p.notice:has-text("Answers saved")');
  if (!(await o.inputValue('textarea[name=call_script]')).includes('calling on behalf of Shine Co')) fail('script should be kept on edit');
  await o.goto(base + '/outbox');
  const b3 = (await o.locator('p.notice').count()) ? await o.textContent('p.notice') : '';
  await o.click('text=Run now');
  await o.waitForFunction((b) => { const n = document.querySelector('p.notice'); return n && n.textContent !== b && n.textContent.includes('Run finished'); }, b3, { timeout: 120000 });
  console.log('run 3:', await o.textContent('p.notice'));
  const ran = psql('SELECT count(*) FROM targets WHERE last_run_at IS NOT NULL');
  if (ran !== '5') fail(`search limit should allow exactly one more search, ran ${ran}`);

  // Checklist moves on
  await o.goto(base + '/');
  const home = await o.textContent('section[aria-labelledby=todo-h]');
  if (home.includes('Add your first business') || home.includes('Add a sales rep')) fail('Home should move past the first steps');
  await o.screenshot({ path: S + '/27-home-checklist.png', fullPage: false });

  console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
  await browser.close();
})();
