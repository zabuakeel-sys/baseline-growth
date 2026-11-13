// Stand-in for the Claude Messages API, for tests: answers in the real response format with a
// JSON suggestion, and records each request so the test can check what was sent.
const http = require('http');
const fs = require('fs');
const LOG = process.argv[2] || '/var/tmp/claude-requests.json';
fs.writeFileSync(LOG, '[]');
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const log = JSON.parse(fs.readFileSync(LOG, 'utf8')); log.push({ path: req.url, body: b }); fs.writeFileSync(LOG, JSON.stringify(log));
    const sys = String(b.system || '');
    const content = String(b.messages?.[0]?.content || '');
    const text = sys.includes('personal first line')
      ? JSON.stringify({ line: content.includes('4.8') ? 'Saw that your clinic in Troy has a 4.8 rating from 120 reviews.' : '' })
      : sys.includes('draft a reply')
      ? JSON.stringify({ reply: 'Hi Pat,\n\nThanks for writing back. The free walkthrough takes about 20 minutes. You can book here: https://libra.example/book', intent: 'wants_meeting' })
      : JSON.stringify(b.messages?.[0]?.content?.includes('expensive')
      ? { say: 'Totally fair. We quote after a free walkthrough, so you compare real numbers. Does Thursday work?', objection: 'price', why: 'Price objection: move to the free walkthrough.' }
      : { say: 'What would you change about your current cleaning?', objection: 'none', why: 'Open question to find the pain.' });
    res.writeHead(200, { 'Content-Type': 'application/json', 'request-id': 'req_test' });
    res.end(JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', model: b.model, content: [{ type: 'text', text }],
      stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }));
  });
}).listen(3300, () => console.log('mock claude on 3300'));
