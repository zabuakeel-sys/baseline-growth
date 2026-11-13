// Local SMTP server that accepts any login and records every message it receives to a JSON file.
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const out = process.argv[2];
fs.writeFileSync(out, '[]');
new SMTPServer({
  secure: false, authOptional: true, disabledCommands: ['STARTTLS'],
  onAuth(auth, session, cb) { cb(null, { user: auth.username }); },
  onData(stream, session, cb) {
    simpleParser(stream).then((m) => {
      const list = JSON.parse(fs.readFileSync(out, 'utf8'));
      list.push({ to: m.to?.text, cc: m.cc?.text, from: m.from?.text, subject: m.subject, text: m.text, messageId: m.messageId, inReplyTo: m.inReplyTo || null });
      fs.writeFileSync(out, JSON.stringify(list, null, 2));
      cb();
    }).catch(cb);
  },
}).listen(2525, () => console.log('smtp capture on 2525'));
