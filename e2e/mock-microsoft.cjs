// Stand-in for Microsoft's sign-in (login.microsoftonline.com) for tests: the authorize page
// sends the browser straight back with a code, and the token endpoint hands out tokens.
const http = require('http');
const fs = require('fs');
// Microsoft Graph stand-in: drafts, send, inbox. Sent mail is written to /var/tmp/graph-sent.json.
let roles = ['Mail.Send', 'Mail.ReadWrite'];
const messages = new Map(); // id -> message
let n = 0;
const SENT = '/var/tmp/graph-sent.json';
fs.writeFileSync(SENT, '[]');
const jwt = (claims) => ['x', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
function graphApi(req, res, url, body) {
  const m = url.pathname.match(/^\/v1\.0\/users\/([^/]+)(\/.*)$/);
  if (!m) return json(res, 404, { error: { code: 'NotFound' } });
  const user = decodeURIComponent(m[1]);
  const rest = m[2];
  if (!String(req.headers.authorization).startsWith('Bearer app-')) return json(res, 401, { error: { code: 'InvalidAuthenticationToken' } });
  if (user === 'nobody@libra.example') return json(res, 404, { error: { code: 'ResourceNotFound', message: 'User not found' } });
  if (rest === '/mailFolders/inbox') return json(res, 200, { id: 'inbox' });
  if (rest.startsWith('/mailFolders/inbox/messages')) {
    return json(res, 200, { value: [...messages.values()].filter((x) => x.user === user && x.folder === 'inbox' && !x.isRead) });
  }
  if (rest === '/messages' && req.method === 'POST') {
    const id = `m${++n}`;
    messages.set(id, { ...body, id, user, folder: 'drafts', internetMessageId: `<draft-${n}@libraprofs.example>` });
    return json(res, 201, { id });
  }
  if (rest.startsWith('/messages') && req.method === 'GET' && url.searchParams.get('$filter')) {
    const want = url.searchParams.get('$filter').match(/'(.+)'/)[1].replace(/''/g, "'");
    return json(res, 200, { value: [...messages.values()].filter((x) => x.user === user && x.internetMessageId === want).map((x) => ({ id: x.id })) });
  }
  const one = rest.match(/^\/messages\/([^/?]+)(\/\w+)?$/);
  if (one) {
    const msg = messages.get(one[1]);
    if (!msg) return json(res, 404, { error: { code: 'ErrorItemNotFound' } });
    if (one[2] === '/send') {
      msg.folder = 'sent';
      const list = JSON.parse(fs.readFileSync(SENT, 'utf8'));
      list.push({ from: user, to: msg.toRecipients.map((r) => r.emailAddress.address).join(', '), subject: msg.subject, body: msg.body, internetMessageId: msg.internetMessageId, replyTo: msg.replyTo || null });
      fs.writeFileSync(SENT, JSON.stringify(list));
      return json(res, 202);
    }
    if (one[2] === '/createReply') {
      const id = `m${++n}`;
      messages.set(id, { id, user, folder: 'drafts', internetMessageId: `<draft-${n}@libraprofs.example>`, replyTo: msg.internetMessageId, subject: `RE: ${msg.subject}` });
      return json(res, 201, { id });
    }
    if (req.method === 'PATCH') { Object.assign(msg, body); return json(res, 200, msg); }
    return json(res, 200, msg);
  }
  if (rest === '/sendMail') {
    const list = JSON.parse(fs.readFileSync(SENT, 'utf8'));
    list.push({ from: user, to: body.message.toRecipients.map((r) => r.emailAddress.address).join(', '), subject: body.message.subject, body: body.message.body, internetMessageId: null });
    fs.writeFileSync(SENT, JSON.stringify(list));
    return json(res, 202);
  }
  return json(res, 404, { error: { code: 'NotFound' } });
}
const idToken = (email) => ['x', Buffer.from(JSON.stringify({ email, name: 'Zain Akeel' })).toString('base64url'), 'sig'].join('.');
let refreshCount = 0;
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__roles') { roles = (url.searchParams.get('set') || '').split(',').filter(Boolean); return json(res, 200, { roles }); }
  if (url.pathname === '/__inbox') {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => { const msg = JSON.parse(b); const id = `m${++n}`; messages.set(id, { ...msg, id, folder: 'inbox', isRead: false }); json(res, 200, { id }); });
    return;
  }
  if (url.pathname.startsWith('/v1.0/')) {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => graphApi(req, res, url, b ? JSON.parse(b) : {}));
    return;
  }
  if (url.pathname.endsWith('/authorize')) {
    const back = new URL(url.searchParams.get('redirect_uri'));
    if (url.searchParams.get('login_hint') === 'deny@libra.example') back.searchParams.set('error', 'access_denied'), back.searchParams.set('error_description', 'AADSTS65004: User declined to consent.');
    else back.searchParams.set('code', 'code-123');
    back.searchParams.set('state', url.searchParams.get('state'));
    res.writeHead(302, { Location: back.toString() }); res.end(); return;
  }
  if (url.pathname.endsWith('/token')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const p = new URLSearchParams(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (p.get('grant_type') === 'client_credentials') {
        res.end(JSON.stringify({ access_token: `app-${jwt({ roles })}`.replace('app-x.', 'app-x.'), expires_in: 3600 }));
        return;
      }
      if (p.get('grant_type') === 'authorization_code') {
        if (p.get('code') !== 'code-123' || !p.get('scope').includes('SMTP.Send') || !p.get('client_secret')) { res.end(JSON.stringify({ error: 'invalid_grant' })); return; }
        res.end(JSON.stringify({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600, id_token: idToken('zain@libra.example') }));
      } else {
        refreshCount++;
        res.end(JSON.stringify({ access_token: `access-r${refreshCount}`, refresh_token: `refresh-r${refreshCount}`, expires_in: 3600 }));
      }
    });
    return;
  }
  res.writeHead(404); res.end();
}).listen(3500, () => console.log('mock microsoft on 3500'));
