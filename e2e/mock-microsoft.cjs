// Stand-in for Microsoft's sign-in (login.microsoftonline.com) for tests: the authorize page
// sends the browser straight back with a code, and the token endpoint hands out tokens.
const http = require('http');
const idToken = (email) => ['x', Buffer.from(JSON.stringify({ email, name: 'Zain Akeel' })).toString('base64url'), 'sig'].join('.');
let refreshCount = 0;
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
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
