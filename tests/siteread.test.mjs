import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSite, pagesToRead, visibleText } from '../src/lib/siteread.js';

const html = `<html><head><title>Shine Cleaning | Office Cleaning in Troy, MI</title>
<meta name="description" content="Nightly office &amp; medical cleaning across Oakland County.">
<meta property="og:image" content="https://shine.example/share.jpg"><style>.x{color:red}</style><script>var a = "<p>hidden</p>";</script></head>
<body><a href="/"><img src="/img/shine-logo.png" alt="Shine logo"></a>
<a href="tel:+1 (248) 555-0101">Call us</a> <a href="tel:911">x</a>
<a href="/about-us">About</a><a href="/services/medical">Services</a><a href="/pricing?x=1">Pricing</a><a href="https://facebook.com/shine">FB</a>
<a href="https://calendly.com/shine/walkthrough">Book a free walkthrough</a>
<h1>We clean offices</h1><p>Family run since 2009.</p></body></html>`;

test('reads name, logo, phone, booking link and pages to read', () => {
  const f = extractSite(html, 'https://shine.example/');
  assert.equal(f.siteName, 'Shine Cleaning');
  assert.equal(f.description, 'Nightly office & medical cleaning across Oakland County.');
  assert.equal(f.logo, 'https://shine.example/img/shine-logo.png');
  assert.deepEqual(f.phones, ['+1 (248) 555-0101']);
  assert.equal(f.bookingLink, 'https://calendly.com/shine/walkthrough');
  assert.deepEqual(pagesToRead(f.links), ['https://shine.example/about-us', 'https://shine.example/services/medical', 'https://shine.example/pricing']);
  assert.match(f.text, /We clean offices\s+Family run since 2009\./);
  assert.doesNotMatch(f.text, /hidden|color:red/);
});

test('no logo over plain http, and visible text drops tags', () => {
  const f = extractSite('<img src="http://x.example/logo.png">', 'http://x.example/');
  assert.equal(f.logo, '');
  assert.equal(visibleText('<p>a</p><p>b &amp; c</p>'), 'a\nb & c');
});
