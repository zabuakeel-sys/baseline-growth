import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeLogoUrl, toHtml } from '../src/lib/emailhtml.js';

const text = 'Hi Pat,\n\nWe clean <offices> & clinics.\nAsk me anything.\n\nZaino\nOn behalf of Shine Co\n\nIf you\'d rather not hear from us, reply "no thanks".';

test('html keeps the same words, escaped, with line breaks', () => {
  const html = toHtml(text);
  assert.match(html, /<p[^>]*>Hi Pat,<\/p>/);
  assert.match(html, /We clean &lt;offices&gt; &amp; clinics\.<br>Ask me anything\./);
  assert.match(html, /reply &quot;no thanks&quot;/);
  assert.doesNotMatch(html, /<img/);
});

test('logo goes after the signature, only from https links', () => {
  const html = toHtml(text, { logoUrl: 'https://shine.example/logo.png', clientName: 'Shine Co' });
  const sig = html.indexOf('On behalf of Shine Co');
  const img = html.indexOf('<img src="https://shine.example/logo.png" alt="Shine Co"');
  const optOut = html.indexOf('no thanks');
  assert.ok(sig > 0 && img > sig && optOut > img, 'logo between signature and opt-out');
  assert.equal(safeLogoUrl('http://shine.example/logo.png'), '');
  assert.equal(safeLogoUrl('javascript:alert(1)'), '');
  assert.doesNotMatch(toHtml(text, { logoUrl: 'javascript:alert(1)' }), /<img/);
});
