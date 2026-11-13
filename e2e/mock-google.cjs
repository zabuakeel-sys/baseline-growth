// Stand-in for Google Places text search plus two small business websites.
const http = require('http');
const site = 'http://localhost:3200';
const page1 = { places: [
  { id: 'p-dean', displayName: { text: "Al Dean's Auto Repair" }, formattedAddress: '1 Main St, Auburn Hills, MI', nationalPhoneNumber: '(248) 555-0100', websiteUri: site + '/dean', rating: 4.7, userRatingCount: 85, businessStatus: 'OPERATIONAL' },
  { id: 'p-midas', displayName: { text: 'Midas Auto Service' }, formattedAddress: '2 Main St, Detroit, MI', nationalPhoneNumber: '(313) 555-0200', websiteUri: site + '/midas', rating: 4.1, userRatingCount: 900, businessStatus: 'OPERATIONAL' },
], nextPageToken: 'page-2' };
const page2 = { places: [
  { id: 'p-gear', displayName: { text: 'Gearhead Garage' }, formattedAddress: '3 Elm St, Detroit, MI', nationalPhoneNumber: '(313) 555-0300', rating: 3.9, userRatingCount: 6, businessStatus: 'OPERATIONAL' },
  { id: 'p-closed', displayName: { text: 'Closed Motors' }, formattedAddress: '4 Oak St, Detroit, MI', businessStatus: 'CLOSED_PERMANENTLY' },
  { id: 'p-nocontact', displayName: { text: 'Mystery Mechanics' }, formattedAddress: '5 Pine St, Detroit, MI', businessStatus: 'OPERATIONAL' },
] };
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/places') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const b = JSON.parse(body);
      console.log('places request:', b.textQuery, '| key:', req.headers['x-goog-api-key'], '| fields ok:', (req.headers['x-goog-fieldmask'] || '').includes('places.websiteUri'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // Searches for medical and dental businesses get 4 different businesses per query, so
      // autopilot tests can see many searches add many prospects.
      if (/dental|clinic|medical/i.test(b.textQuery)) {
        const city = b.textQuery.split(' in ').pop();
        const slug = b.textQuery.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const places = [1, 2, 3, 4].map((i) => ({
          id: `p-${slug}-${i}`, displayName: { text: `${city.split(',')[0]} ${b.textQuery.split(' in ')[0]} ${i}` },
          formattedAddress: `${i}0 Main St, ${city} 48000, USA`, nationalPhoneNumber: `(248) 555-${String(1000 + slug.length * 10 + i).slice(-4)}`,
          websiteUri: `${site}/biz/${slug}-${i}`, rating: 4.6, userRatingCount: 40, businessStatus: 'OPERATIONAL',
        }));
        res.end(JSON.stringify({ places }));
        return;
      }
      res.end(JSON.stringify(b.pageToken === 'page-2' ? page2 : page1));
    });
    return;
  }
  const biz = req.url.match(/^\/biz\/([a-z0-9-]+)$/);
  if (biz) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<html><head><title>${biz[1]}</title></head><body>Contact: office@${biz[1]}.example</body></html>`); return; }
  const html = {
    '/dean': '<html><head><title>Al Dean Auto</title><meta name="description" content="Family-owned auto repair in Auburn Hills since 1987"></head><body><a href="/contact">Contact</a></body></html>',
    '/contact': '<html><body>Email us at info@aldeansauto.example or call.</body></html>',
  }[req.url];
  if (html) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); return; }
  res.writeHead(404); res.end();
}).listen(3200, () => console.log('mock on 3200'));
