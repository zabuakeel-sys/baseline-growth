// "Connect with Microsoft": sign in (stand-in Microsoft on :3500), the mailbox is saved with an
// encrypted refresh token and no password, and sending signs in with an OAuth token.
// Needs: mock-microsoft.cjs on :3500, smtp-capture.cjs on :2525; app with APP_SECRET,
// MICROSOFT_CLIENT_ID=test MICROSOFT_CLIENT_SECRET=test MICROSOFT_LOGIN_URL=http://127.0.0.1:3500
// MICROSOFT_SMTP_HOST=127.0.0.1 MICROSOFT_SMTP_PORT=2525 MICROSOFT_IMAP_HOST=127.0.0.1 MICROSOFT_IMAP_PORT=1143
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const S = process.argv[2] || require('node:os').tmpdir();
const CAPTURE = process.argv[3] || '/var/tmp/sent.json';
const base = 'http://localhost:3100';
const psql = (sql) => execSync(`psql -h /var/tmp/bgpg -p 5433 -U app -d bg -tAc "${sql.replace(/"/g, '\\"')}"`).toString().trim();

(async () => {
  const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };
  const browser = await chromium.launch();
  const p = await (await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await p.goto(base + '/login');
  await p.fill('input[name=email]', 'owner@example.test');
  await p.fill('input[name=password]', 'testpassword123');
  await p.click('button[type=submit]');
  await p.waitForURL(base + '/');
  const id = psql("SELECT id FROM clients WHERE name LIKE 'LibraPro%'");

  await p.goto(`${base}/clients/${id}`);
  await p.click('summary:has-text("Advanced")');
  await p.click('a:has-text("sign in with Microsoft")');
  await p.waitForSelector('p.notice');
  const notice = await p.textContent('p.notice');
  console.log('after sign-in:', notice);
  if (!notice.includes('zain@libra.example')) fail('should say which mailbox signed in');
  const row = psql(`SELECT auth || '|' || provider || '|' || email || '|' || password_enc || '|' || (refresh_token_enc LIKE 'v1:%') || '|' || (refresh_token_enc NOT LIKE '%refresh-%') FROM client_mailboxes WHERE client_id = ${id}`);
  if (row !== 'oauth|microsoft|zain@libra.example||true|true') fail(`mailbox saved wrong: ${row}`);
  const auths = JSON.parse(fs.readFileSync(`${CAPTURE}.auth`, 'utf8'));
  const oauthLogin = auths.find((a) => a.method === 'XOAUTH2');
  if (!oauthLogin || oauthLogin.user !== 'zain@libra.example' || !/^access-r\d+$/.test(oauthLogin.accessToken)) fail(`sending should sign in with a token: ${JSON.stringify(auths)}`);
  // Sending worked; reading fails here only because the local IMAP server has no OAuth. The page explains it.
  const box = await p.textContent('section[aria-labelledby=mailbox-h]');
  if (!box.includes('connected with Microsoft')) fail('panel should show the Microsoft connection');
  if (box.includes('Sending login failed')) fail('sending should have worked');
  await p.screenshot({ path: S + '/36-microsoft-connected.png', fullPage: false });

  // Declined consent comes back as a readable message
  psql(`UPDATE client_mailboxes SET email = 'deny@libra.example' WHERE client_id = ${id}`);
  await p.goto(`${base}/clients/${id}`);
  await p.goto(`${base}/oauth/microsoft/start?client=${id}&hint=deny@libra.example`);
  await p.waitForSelector('p.notice:has-text("Microsoft said no")');
  // A forged callback without the browser's state is refused
  await p.goto(`${base}/oauth/microsoft/callback?code=code-123&state=forged`);
  await p.waitForSelector('p.notice:has-text("expired or did not match")');

  await browser.close();
  console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
