import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSite, findAddress, pagesToRead, structuredData, visibleText } from '../src/lib/siteread.js';

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

test('reads the business data sites embed for Google', () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"x"},
    {"@type":["LocalBusiness","HomeAndConstructionBusiness"],"name":"Shine Cleaning","telephone":"(248) 555-0101","email":"mailto:Hello@Shine.example",
     "address":{"@type":"PostalAddress","streetAddress":"1 Shine Way","addressLocality":"Troy","addressRegion":"MI","postalCode":"48084"},
     "areaServed":["Troy",{"@type":"City","name":"Southfield"}],"logo":{"url":"https://shine.example/logo.png"}}]}</script>`;
  assert.deepEqual(structuredData(html), { name: 'Shine Cleaning', telephone: '(248) 555-0101', email: 'hello@shine.example',
    address: '1 Shine Way, Troy, MI 48084', areas: ['Troy', 'Southfield'], logo: 'https://shine.example/logo.png' });
  assert.deepEqual(structuredData('<script type="application/ld+json">{broken</script>').areas, []);
});

test('finds a street address and an email written on the page', () => {
  assert.equal(findAddress('Visit us at 2450 W. Big Beaver Rd, Suite 200, Troy, MI 48084 today'), '2450 W. Big Beaver Rd, Suite 200, Troy, MI 48084');
  assert.equal(findAddress('Call 248 555 0101'), '');
  const f = extractSite('<p>Email info@shine.example or 12 Main St, Troy, MI 48084</p>', 'https://shine.example/');
  assert.equal(f.email, 'info@shine.example');
  assert.equal(f.address, '12 Main St, Troy, MI 48084');
});
