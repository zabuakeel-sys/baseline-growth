// Call assistant with the AI coach on, against e2e/mock-claude.cjs: checks the request the
// official SDK sends and that the suggestion reaches the screen.
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const base = 'http://localhost:3100';
const LOG = process.argv[2] || '/var/tmp/claude-requests.json';
const psql = (sql) => execSync(`psql -h /var/tmp/bgpg -p 5433 -U app -d bg -tAc "${sql}"`).toString().trim();
(async () => {
  const browser = await chromium.launch();
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  const p = await browser.newPage();
  await p.goto(base + '/login');
  await p.fill('input[name=email]', 'owner@example.test');
  await p.fill('input[name=password]', 'testpassword123');
  await p.click('button[type=submit]');
  await p.waitForURL(base + '/today');
  const clientId = psql("SELECT id FROM clients WHERE name LIKE 'LibraPro%'");
  psql(`INSERT INTO leads (client_id, name, phone, received_on) VALUES (${clientId}, 'Coach Test Co', '1', CURRENT_DATE)`);
  const id = psql("SELECT id FROM leads WHERE name = 'Coach Test Co'");
  await p.goto(`${base}/call/${id}`);
  if (await p.locator('text=AI coach is not connected').count()) fail('coach should show as connected');
  await p.locator('.call input[type=checkbox]').click();
  await p.fill('input[placeholder="We already have a cleaner"]', 'It sounds expensive');
  await p.click('text=Add and suggest');
  await p.waitForFunction(() => document.querySelector('.suggestion')?.textContent.includes('from the coach'));
  console.log('ai suggestion:', (await p.textContent('.suggestion')).replace(/\s+/g, ' '));
  const reqs = JSON.parse(fs.readFileSync(LOG, 'utf8'));
  const r = reqs[reqs.length - 1];
  console.log('request:', r.path, r.body.model, JSON.stringify(r.body.output_config).slice(0, 120));
  if (r.path !== '/v1/messages' || r.body.model !== 'claude-opus-5-5' || r.body.output_config?.effort !== 'low' || r.body.output_config?.format?.type !== 'json_schema') fail('request shape wrong');
  if (!r.body.messages[0].content.includes('It sounds expensive') || !r.body.messages[0].content.includes('Client: LibraPro')) fail('context missing from request');
  console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
  await browser.close();
})();
